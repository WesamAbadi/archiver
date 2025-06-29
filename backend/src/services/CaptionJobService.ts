import prisma from '../lib/database';
import { CaptionService } from './CaptionService';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

interface RateLimitConfig {
  jobsPerMinute: number;
  jobsPerDay: number;
}

interface QueueStatus {
  position: number;
  totalJobs: number;
  estimatedWaitTime: number; // in minutes
}

export class CaptionJobService {
  private captionService: CaptionService;
  private io?: any;
  private isProcessing = false;
  private rateLimits: RateLimitConfig = {
    jobsPerMinute: parseInt(process.env.CAPTION_JOBS_PER_MINUTE || '2'),
    jobsPerDay: parseInt(process.env.CAPTION_JOBS_PER_DAY || '1000')
  };
  private processedToday = 0;
  private lastProcessedTime = 0;
  private dailyResetTime = new Date();

  constructor(io?: any) {
    this.io = io;
    this.captionService = new CaptionService(io);
    this.startQueueProcessor();
    this.resetDailyCountIfNeeded();
  }

  // Helper method to ensure user exists and get their database ID
  private async ensureUserExists(userUid: string): Promise<string> {
    let user = await prisma.user.findUnique({
      where: { uid: userUid }
    });

    if (!user) {
      // If user doesn't exist, create them with minimal data
      user = await prisma.user.create({
        data: {
          uid: userUid,
          email: `${userUid}@temp.example.com`, // Temporary email
          displayName: 'User',
        }
      });
      console.log('Created new user in database:', user.id);
    }

    return user.id; // Return the database ID, not the OAuth UID
  }

  // Add a new caption job to the queue
  async addJob(mediaItemId: string, userUid: string, priority: number = 0): Promise<string> {
    console.log(`📝 Adding caption job for media item: ${mediaItemId}`);
    
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userUid);
    
    // Check if job already exists
    const existingJob = await prisma.captionJob.findFirst({
      where: {
        mediaItemId,
        status: { in: ['QUEUED', 'PROCESSING'] }
      }
    });

    if (existingJob) {
      console.log(`⚠️ Caption job already exists for media item: ${mediaItemId}`);
      return existingJob.id;
    }

    // Update media item status to QUEUED
    await prisma.mediaItem.update({
      where: { id: mediaItemId },
      data: { 
        captionStatus: 'QUEUED',
        captionErrorMessage: null
      }
    });

    // Create the job with database user ID
    const job = await prisma.captionJob.create({
      data: {
        id: uuidv4(),
        userId: dbUserId, // Use database user ID, not OAuth UID
        mediaItemId,
        priority,
        estimatedStartTime: await this.calculateEstimatedStartTime()
      }
    });

    console.log(`✅ Caption job created: ${job.id} for media item: ${mediaItemId}`);
    
    // Notify user about queue position (use OAuth UID for socket room)
    await this.notifyUserQueueStatus(userUid, mediaItemId);
    
    return job.id;
  }

  // Get queue status for a specific media item
  async getQueueStatus(mediaItemId: string): Promise<QueueStatus | null> {
    const job = await prisma.captionJob.findFirst({
      where: {
        mediaItemId,
        status: { in: ['QUEUED', 'PROCESSING'] }
      }
    });

    if (!job) {
      return null;
    }

    const position = await prisma.captionJob.count({
      where: {
        status: 'QUEUED',
        OR: [
          { priority: { gt: job.priority } },
          { 
            priority: job.priority,
            createdAt: { lt: job.createdAt }
          }
        ]
      }
    });

    const totalJobs = await prisma.captionJob.count({
      where: { status: 'QUEUED' }
    });

    const estimatedWaitTime = this.calculateEstimatedWaitTime(position + 1);

    return {
      position: position + 1,
      totalJobs,
      estimatedWaitTime
    };
  }

  // Get user's queue status
  async getUserQueueStatus(userUid: string): Promise<any[]> {
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userUid);
    
    const jobs = await prisma.captionJob.findMany({
      where: {
        userId: dbUserId,
        status: { in: ['QUEUED', 'PROCESSING'] }
      },
      include: {
        mediaItem: {
          select: {
            id: true,
            title: true,
            captionStatus: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    const result = [];
    for (const job of jobs) {
      const queueStatus = await this.getQueueStatus(job.mediaItemId);
      result.push({
        jobId: job.id,
        mediaItem: job.mediaItem,
        status: job.status,
        queuePosition: queueStatus?.position || 0,
        estimatedWaitTime: queueStatus?.estimatedWaitTime || 0,
        createdAt: job.createdAt
      });
    }

    return result;
  }

  // Main queue processor
  private async startQueueProcessor(): Promise<void> {
    console.log('🔄 Starting caption job queue processor...');
    
    setInterval(async () => {
      if (!this.isProcessing && this.canProcessJob()) {
        await this.processNextJob();
      }
    }, 10000); // Check every 10 seconds

    // Reset daily counter at midnight
    setInterval(() => {
      this.resetDailyCountIfNeeded();
    }, 60000); // Check every minute
  }

  private async processNextJob(): Promise<void> {
    this.isProcessing = true;

    try {
      // Get next job with highest priority and earliest creation time
      const nextJob = await prisma.captionJob.findFirst({
        where: { status: 'QUEUED' },
        include: {
          mediaItem: {
            include: { files: true }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      if (!nextJob) {
        this.isProcessing = false;
        return;
      }

      console.log(`🎬 Processing caption job: ${nextJob.id} for media: ${nextJob.mediaItem.title}`);

      // Update job status to PROCESSING
      await prisma.captionJob.update({
        where: { id: nextJob.id },
        data: {
          status: 'PROCESSING',
          processingStartedAt: new Date(),
          attempts: nextJob.attempts + 1
        }
      });

      // Update media item status
      await prisma.mediaItem.update({
        where: { id: nextJob.mediaItemId },
        data: { captionStatus: 'PROCESSING' }
      });

      // Notify user that processing started
      if (this.io) {
        this.io.to(`user:${nextJob.userId}`).emit('caption-job-update', {
          mediaItemId: nextJob.mediaItemId,
          status: 'PROCESSING',
          message: 'Caption generation started',
          jobId: nextJob.id
        });
      }

      try {
        // Check if media item has audio/video files
        const mediaFile = nextJob.mediaItem.files[0];
        if (!mediaFile) {
          throw new Error('No media file found');
        }

        const isAudioVideo = mediaFile.mimeType.includes('audio') || mediaFile.mimeType.includes('video');
        
        if (!isAudioVideo) {
          // Skip non-audio/video files
          await this.completeJob(nextJob.id, nextJob.mediaItemId, 'SKIPPED', 'File is not audio or video content');
          this.processedToday++;
          this.lastProcessedTime = Date.now();
          this.isProcessing = false;
          return;
        }

        // Download file temporarily for caption generation
        const tempFilePath = await this.downloadFileTemporarily(mediaFile.downloadUrl, mediaFile.filename);

        try {
          // Generate captions
          const caption = await this.captionService.generateCaptions(
            nextJob.mediaItemId,
            tempFilePath,
            nextJob.userId,
            nextJob.id
          );

          // Mark job as completed
          await this.completeJob(nextJob.id, nextJob.mediaItemId, 'COMPLETED');

          console.log(`✅ Caption job completed: ${nextJob.id}`);

          // Notify user of completion
          if (this.io) {
            this.io.to(`user:${nextJob.userId}`).emit('caption-job-update', {
              mediaItemId: nextJob.mediaItemId,
              status: 'COMPLETED',
              message: 'Captions generated successfully',
              jobId: nextJob.id,
              caption
            });
          }

        } finally {
          // Clean up temp file
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        }

      } catch (error) {
        console.error(`❌ Caption job failed: ${nextJob.id}`, error);
        await this.handleJobFailure(nextJob, (error as Error).message);
      }

      this.processedToday++;
      this.lastProcessedTime = Date.now();

    } catch (error) {
      console.error('❌ Error in queue processor:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async completeJob(jobId: string, mediaItemId: string, status: 'COMPLETED' | 'SKIPPED', message?: string): Promise<void> {
    await prisma.captionJob.update({
      where: { id: jobId },
      data: {
        status: status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED',
        completedAt: new Date(),
        errorMessage: message || null
      }
    });

    await prisma.mediaItem.update({
      where: { id: mediaItemId },
      data: {
        captionStatus: status,
        captionGeneratedAt: status === 'COMPLETED' ? new Date() : null,
        captionErrorMessage: message || null
      }
    });
  }

  private async handleJobFailure(job: any, errorMessage: string): Promise<void> {
    if (job.attempts >= job.maxAttempts) {
      // Job failed permanently
      await prisma.captionJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage
        }
      });

      await prisma.mediaItem.update({
        where: { id: job.mediaItemId },
        data: {
          captionStatus: 'FAILED',
          captionErrorMessage: errorMessage
        }
      });

      // Notify user of failure
      if (this.io) {
        this.io.to(`user:${job.userId}`).emit('caption-job-update', {
          mediaItemId: job.mediaItemId,
          status: 'FAILED',
          message: `Caption generation failed: ${errorMessage}`,
          jobId: job.id
        });
      }

      console.log(`❌ Caption job permanently failed: ${job.id} after ${job.attempts} attempts`);
    } else {
      // Retry the job
      await prisma.captionJob.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          processingStartedAt: null,
          errorMessage: `Attempt ${job.attempts} failed: ${errorMessage}`
        }
      });

      await prisma.mediaItem.update({
        where: { id: job.mediaItemId },
        data: { captionStatus: 'QUEUED' }
      });

      console.log(`🔄 Retrying caption job: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
    }
  }

  private async downloadFileTemporarily(downloadUrl: string, filename: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `caption_${Date.now()}_${filename}`);

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', (err) => reject(err));
    });

    return tempFilePath;
  }

  private canProcessJob(): boolean {
    this.resetDailyCountIfNeeded();
    
    // Check daily limit
    if (this.processedToday >= this.rateLimits.jobsPerDay) {
      console.log(`⏸️ Daily caption job limit reached: ${this.processedToday}/${this.rateLimits.jobsPerDay}`);
      return false;
    }

    // Check per-minute limit
    const now = Date.now();
    const timeSinceLastJob = now - this.lastProcessedTime;
    const minIntervalMs = (60 * 1000) / this.rateLimits.jobsPerMinute;

    if (timeSinceLastJob < minIntervalMs) {
      return false;
    }

    return true;
  }

  private resetDailyCountIfNeeded(): void {
    const now = new Date();
    if (now.getDate() !== this.dailyResetTime.getDate() || 
        now.getMonth() !== this.dailyResetTime.getMonth() ||
        now.getFullYear() !== this.dailyResetTime.getFullYear()) {
      this.processedToday = 0;
      this.dailyResetTime = now;
      console.log('🔄 Daily caption job counter reset');
    }
  }

  private calculateEstimatedWaitTime(queuePosition: number): number {
    // Estimate based on average processing time and rate limits
    const avgProcessingTimeMinutes = 2; // Average time per job
    const jobsPerMinute = this.rateLimits.jobsPerMinute;
    
    // Calculate wait time considering rate limits
    const estimatedMinutes = Math.ceil((queuePosition - 1) / jobsPerMinute) + avgProcessingTimeMinutes;
    
    return Math.max(0, estimatedMinutes);
  }

  private async calculateEstimatedStartTime(): Promise<Date> {
    const queueCount = await prisma.captionJob.count({
      where: { status: 'QUEUED' }
    });

    const estimatedWaitMinutes = this.calculateEstimatedWaitTime(queueCount + 1);
    const estimatedStartTime = new Date();
    estimatedStartTime.setMinutes(estimatedStartTime.getMinutes() + estimatedWaitMinutes);

    return estimatedStartTime;
  }

  private async notifyUserQueueStatus(userUid: string, mediaItemId: string): Promise<void> {
    if (!this.io) return;

    const queueStatus = await this.getQueueStatus(mediaItemId);
    if (queueStatus) {
      this.io.to(`user:${userUid}`).emit('caption-job-update', {
        mediaItemId,
        status: 'QUEUED',
        message: `Added to caption queue (position ${queueStatus.position})`,
        queuePosition: queueStatus.position,
        estimatedWaitTime: queueStatus.estimatedWaitTime
      });
    }
  }

  // Public method to cancel a job
  async cancelJob(jobId: string, userUid: string): Promise<boolean> {
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userUid);
    
    const job = await prisma.captionJob.findFirst({
      where: {
        id: jobId,
        userId: dbUserId,
        status: { in: ['QUEUED', 'PROCESSING'] }
      }
    });

    if (!job) {
      return false;
    }

    await prisma.captionJob.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date()
      }
    });

    await prisma.mediaItem.update({
      where: { id: job.mediaItemId },
      data: {
        captionStatus: 'FAILED',
        captionErrorMessage: 'Cancelled by user'
      }
    });

    return true;
  }

  // Get queue statistics
  async getQueueStats(): Promise<any> {
    const stats = await prisma.captionJob.groupBy({
      by: ['status'],
      _count: true
    });

    const totalJobs = await prisma.captionJob.count();
    const queuedJobs = await prisma.captionJob.count({ where: { status: 'QUEUED' } });
    const processingJobs = await prisma.captionJob.count({ where: { status: 'PROCESSING' } });

    return {
      totalJobs,
      queuedJobs,
      processingJobs,
      processedToday: this.processedToday,
      dailyLimit: this.rateLimits.jobsPerDay,
      rateLimits: this.rateLimits,
      stats: stats.reduce((acc: any, stat: any) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {})
    };
  }
} 