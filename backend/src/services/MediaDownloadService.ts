import ytdl from 'ytdl-core';
import youtubeDl from 'youtube-dl-exec';
import scdl from 'soundcloud-downloader';
import Soundcloud from 'soundcloud.ts';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem, DownloadJob, Platform, DownloadStatus, Visibility } from '../types';
import { BackblazeService } from './BackblazeService';
import { GeminiService } from './GeminiService';
import { CaptionService } from './CaptionService';
import { CaptionJobService } from './CaptionJobService';
import { createError } from '../middleware/errorHandler';
import prisma from '../lib/database';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { uploadCancellationService } from './UploadCancellationService';
import { checkStorageLimit } from '../routes/user';

export class MediaDownloadService {
  private backblazeService: BackblazeService;
  private geminiService = new GeminiService();
  private captionService: CaptionService;
  private captionJobService: CaptionJobService;
  private io?: any; // Socket.IO instance for progress updates
  private useSoundCloudAlternative = process.env.USE_SOUNDCLOUD_ALTERNATIVE === 'true';

  constructor(io?: any) {
    this.io = io;
    this.backblazeService = new BackblazeService(io); // Pass io to BackblazeService
    this.captionService = new CaptionService(io); // Pass io to CaptionService
    this.captionJobService = new CaptionJobService(io); // Initialize caption job service
  }

  // Helper function to remove undefined values from objects
  private cleanObject(obj: any): any {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          cleaned[key] = this.cleanObject(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  // Helper method to ensure user exists and get their database ID
  private async ensureUserExists(userUid: string): Promise<string> {
    let user = await prisma.user.findUnique({
      where: { uid: userUid }
    });

    if (!user) {
      // If user doesn't exist, create them with minimal data
      // In a real app, this should be done during authentication
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

  // Helper method to convert BigInt fields to strings for JSON serialization
  private serializeMediaItem(mediaItem: any): any {
    return {
      ...mediaItem,
      size: mediaItem.size ? mediaItem.size.toString() : null,
      files: mediaItem.files?.map((file: any) => ({
        ...file,
        size: file.size ? file.size.toString() : null
      })) || []
    };
  }

  async processDownloadImmediate(params: {
    userId: string;
    url: string;
    platform: Platform;
    visibility: Visibility;
    tags: string[];
  }): Promise<{ jobId: string; mediaItem: MediaItem }> {
    const jobId = uuidv4(); // Generate job ID for progress tracking
    
    try {
      // We'll check storage after download but before processing
      // since we don't know the file size beforehand
      const { hasSpace, currentUsage, limit } = await checkStorageLimit(params.userId);
      
      if (!hasSpace) {
        throw createError('Storage limit reached. Please free up space before downloading.', 413);
      }

      this.emitUploadProgress(params.userId, jobId, 'download', 0, 'Starting download...');
      
      const dbUserId = await this.ensureUserExists(params.userId);
      
      this.emitUploadProgress(params.userId, jobId, 'download', 10, 'Initializing download...');
      
      const downloadResult = await this.downloadFromPlatform(params.url, params.platform, (progress, message) => {
        this.emitUploadProgress(params.userId, jobId, 'download', 10 + Math.floor(progress * 0.4), message);
      });
      
      this.emitUploadProgress(params.userId, jobId, 'b2', 50, 'Uploading to cloud storage...');
      
      const uploadResult = await this.backblazeService.uploadFile(
        downloadResult.filePath,
        downloadResult.filename,
        params.userId,
        jobId
      );

      if (uploadCancellationService.isCancelled(jobId)) {
        // Cleanup B2 file if upload was cancelled during/after
        await this.backblazeService.deleteFile(uploadResult.fileId);
        uploadCancellationService.acknowledge(jobId);
        throw createError('Upload cancelled by user after cloud upload.', 499);
      }
      
      this.emitUploadProgress(params.userId, jobId, 'gemini', 70, 'Generating AI metadata...');
      
      const aiMetadata = await this.geminiService.generateMetadataFromFile(downloadResult.filePath);
      
      // Create media item with flattened metadata structure
      const mediaItemData = {
        id: uuidv4(),
        userId: dbUserId, // Use database user ID, not OAuth UID
        originalUrl: params.url,
        platform: params.platform,
        title: downloadResult.title || 'Untitled',
        description: downloadResult.description,
        visibility: params.visibility,
        tags: params.tags,
        downloadStatus: 'COMPLETED' as DownloadStatus,
        publicId: params.visibility === 'PUBLIC' ? uuidv4() : undefined,
        // Flattened metadata fields
        duration: downloadResult.metadata?.duration,
        size: BigInt(downloadResult.size || 0),
        format: downloadResult.format,
        resolution: downloadResult.metadata?.resolution,
        thumbnailUrl: downloadResult.metadata?.thumbnailUrl,
        originalAuthor: downloadResult.metadata?.originalAuthor,
        originalTitle: downloadResult.metadata?.originalTitle,
        originalDescription: downloadResult.metadata?.originalDescription,
        publishedAt: downloadResult.metadata?.publishedAt,
        hashtags: downloadResult.metadata?.hashtags || [],
        // AI generated metadata
        aiSummary: aiMetadata?.summary,
        aiKeywords: aiMetadata?.keywords || [],
        aiGeneratedAt: aiMetadata ? new Date() : undefined,
        // Caption status - initially pending
        captionStatus: 'PENDING' as any, // Will be updated by the job queue
      };

      const mediaItem = await prisma.mediaItem.create({
        data: mediaItemData,
        include: {
          files: true,
        },
      });

      // Create media file entry
      await prisma.mediaFile.create({
        data: {
          id: uuidv4(),
          mediaItemId: mediaItem.id,
          filename: uploadResult.filename,
          originalName: downloadResult.filename,
          mimeType: downloadResult.mimeType,
          size: BigInt(downloadResult.size || 0),
          b2FileId: uploadResult.fileId,
          b2FileName: uploadResult.fileName,
          downloadUrl: uploadResult.downloadUrl,
          isOriginal: true,
          format: downloadResult.format,
        },
      });
      
      // Add caption generation job to queue instead of generating directly
      if (downloadResult.mimeType.includes('video') || downloadResult.mimeType.includes('audio')) {
        try {
          this.emitUploadProgress(params.userId, jobId, 'transcription', 90, 'Adding to caption queue...');
          
          await this.captionJobService.addJob(mediaItem.id, params.userId, 0);
          
          this.emitUploadProgress(params.userId, jobId, 'transcription', 95, 'Added to caption queue', 'Captions will be generated automatically');
        } catch (error) {
          console.error('Failed to add caption job:', error);
          // Don't fail the entire upload for caption queue issues
        }
      } else {
        // Skip caption generation for non-audio/video content
        await prisma.mediaItem.update({
          where: { id: mediaItem.id },
          data: { captionStatus: 'SKIPPED' as any }
        });
      }
      
      // Clean up temporary file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      
      // After download, check if the downloaded file would exceed storage
      const downloadedSize = downloadResult.size;
      if ((currentUsage + downloadedSize) > limit) {
        // Clean up the downloaded file
        if (fs.existsSync(downloadResult.filePath)) {
          fs.unlinkSync(downloadResult.filePath);
        }
        throw createError('Downloaded file would exceed storage limit. Please free up space.', 413);
      }
      
      // Return serialized media item (converts BigInt to string)
      const serializedMediaItem = this.serializeMediaItem(mediaItem);
      
      this.emitUploadProgress(params.userId, jobId, 'complete', 100, 'All processing completed!', 'Your media is ready', false, mediaItem.id);
      
      return { jobId, mediaItem: serializedMediaItem };
      
    } catch (error) {
      console.error('Download processing error:', error);
      this.emitUploadProgress(params.userId, jobId, 'error', 100, 'Download failed', (error as Error).message, true);
      throw error;
    }
  }

  private async downloadFromPlatform(
    url: string, 
    platform: Platform,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<{
    filePath: string;
    filename: string;
    title?: string;
    description?: string;
    metadata: any;
    mimeType: string;
    size: number;
    format: string;
  }> {
    switch (platform) {
      case 'YOUTUBE':
        return this.downloadFromYouTube(url, progressCallback);
      case 'TWITTER':
        return this.downloadFromTwitter(url, progressCallback);
      case 'SOUNDCLOUD':
        // Use alternative method if configured, otherwise try primary first with fallback
        if (this.useSoundCloudAlternative) {
          console.log('🔄 Using SoundCloud alternative method (soundcloud.ts)');
          return await this.downloadFromSoundCloudAlternative(url, progressCallback);
        } else {
          try {
            console.log('📦 Attempting SoundCloud download with primary method');
            return await this.downloadFromSoundCloud(url, progressCallback);
          } catch (error) {
            console.log('🔄 Primary method failed, trying alternative:', (error as Error).message);
            progressCallback?.(0, 'Retrying with alternative method...');
            return await this.downloadFromSoundCloudAlternative(url, progressCallback);
          }
        }
      default:
        throw new Error(`Platform ${platform} not yet implemented`);
    }
  }

  private async downloadFromYouTube(url: string, progressCallback?: (progress: number, message: string) => void): Promise<any> {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Use direct yt-dlp call instead of youtube-dl-exec
      const timestamp = Date.now();
      const filename = `youtube_${timestamp}`;
      const outputTemplate = path.join(uploadDir, `${filename}.%(ext)s`);
      
      console.log('Starting YouTube download with template:', outputTemplate);
      console.log('YouTube URL:', url);
      
      // Use direct yt-dlp spawn instead of youtube-dl-exec
      await new Promise<void>((resolve, reject) => {
        const ytdlpArgs = [
          url,
          '-o', outputTemplate,
          '--format', 'best[height<=720]/best',
          '--write-info-json',
          '--no-playlist'
        ];
        
        console.log('yt-dlp command:', 'yt-dlp', ytdlpArgs.join(' '));
        
        const ytdlpProcess = spawn('yt-dlp', ytdlpArgs, {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        ytdlpProcess.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          console.log('[yt-dlp stdout]:', output.trim());
          
          // Parse progress from yt-dlp output
          if (output.includes('%')) {
            const progressMatch = output.match(/(\d+(?:\.\d+)?)\s*%/);
            if (progressMatch) {
              const downloadProgress = parseFloat(progressMatch[1]);
              console.log(`Downloading... ${downloadProgress.toFixed(1)}%`);
              progressCallback?.(downloadProgress, output);
            }
          }
        });
        
        ytdlpProcess.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          console.log('[yt-dlp stderr]:', output.trim());
          progressCallback?.(0, output);
        });
        
        ytdlpProcess.on('close', (code) => {
          console.log(`yt-dlp process exited with code ${code}`);
          console.log('Final stdout:', stdout);
          console.log('Final stderr:', stderr);
          
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`yt-dlp failed with exit code ${code}. Error: ${stderr}`));
          }
        });
        
        ytdlpProcess.on('error', (error) => {
          console.error('yt-dlp process error:', error);
          reject(new Error(`Failed to start yt-dlp: ${error.message}`));
        });
      });
      
      // Find the downloaded files
      const files = fs.readdirSync(uploadDir);
      console.log('All files in upload directory after download:', files);
      
      // Look for files that were created recently (within the last 2 minutes)
      const recentFiles = files.filter(file => {
        try {
          const filePath = path.join(uploadDir, file);
          const stats = fs.statSync(filePath);
          const ageInSeconds = (Date.now() - stats.mtime.getTime()) / 1000;
          return ageInSeconds < 120; // Created within last 2 minutes
        } catch (e) {
          return false;
        }
      });
      
      console.log('Recent files found:', recentFiles);
      
      // Find the main video file (not info.json)
      const downloadedFile = recentFiles.find(file => 
        file.startsWith(`youtube_${timestamp}`) && 
        !file.endsWith('.info.json') && 
        !file.endsWith('.webp') && 
        !file.endsWith('.jpg') &&
        !file.endsWith('.part') &&
        (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
      );
      
      // Find the corresponding info file
      const infoFile = recentFiles.find(file => 
        file.startsWith(`youtube_${timestamp}`) && 
        file.endsWith('.info.json')
      );
      
      console.log('Found downloaded file:', downloadedFile);
      console.log('Found info file:', infoFile);
      
      if (!downloadedFile) {
        // If we can't find files with our timestamp, try to find any recent video files
        const anyRecentVideoFiles = recentFiles.filter(file => 
          !file.endsWith('.info.json') && 
          !file.endsWith('.webp') && 
          !file.endsWith('.jpg') &&
          !file.endsWith('.part') &&
          (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
        );
        
        console.log('Any recent video files found:', anyRecentVideoFiles);
        
        if (anyRecentVideoFiles.length > 0) {
          // Use the most recent video file
          const mostRecentVideoFile = anyRecentVideoFiles.sort((a, b) => {
            const aStats = fs.statSync(path.join(uploadDir, a));
            const bStats = fs.statSync(path.join(uploadDir, b));
            return bStats.mtime.getTime() - aStats.mtime.getTime();
          })[0];
          
          console.log('Using most recent video file:', mostRecentVideoFile);
          
          const actualFilePath = path.join(uploadDir, mostRecentVideoFile);
          const stats = fs.statSync(actualFilePath);
          
          let metadata: any = {
            size: stats.size,
            format: path.extname(mostRecentVideoFile).slice(1),
          };
          
          // Try to find any corresponding info file
          const anyInfoFiles = recentFiles.filter(file => file.endsWith('.info.json'));
          if (anyInfoFiles.length > 0) {
            const mostRecentInfoFile = anyInfoFiles.sort((a, b) => {
              const aStats = fs.statSync(path.join(uploadDir, a));
              const bStats = fs.statSync(path.join(uploadDir, b));
              return bStats.mtime.getTime() - aStats.mtime.getTime();
            })[0];
            
            try {
              const infoContent = fs.readFileSync(path.join(uploadDir, mostRecentInfoFile), 'utf8');
              const info = JSON.parse(infoContent);
              
              metadata = {
                ...metadata,
                duration: info.duration || 0,
                originalAuthor: info.uploader || info.channel || 'Unknown',
                originalTitle: info.title || 'Untitled',
                originalDescription: info.description || '',
                publishedAt: info.upload_date ? new Date(info.upload_date) : new Date(),
                thumbnailUrl: info.thumbnail,
                category: info.categories?.[0] || 'Unknown',
                viewCount: info.view_count || 0,
                resolution: info.resolution || `${info.width}x${info.height}` || 'Unknown',
              };
              
              // Clean up info file
              fs.unlinkSync(path.join(uploadDir, mostRecentInfoFile));
            } catch (e) {
              console.log('Could not parse YouTube info JSON:', e.message);
            }
          }
          
          return {
            filePath: actualFilePath,
            filename: mostRecentVideoFile,
            title: metadata.originalTitle || 'YouTube Video',
            description: metadata.originalDescription || '',
            metadata,
            mimeType: mostRecentVideoFile.includes('.mp4') ? 'video/mp4' : 'video/webm',
            size: stats.size,
            format: path.extname(mostRecentVideoFile).slice(1),
          };
        }
        
        throw new Error('Downloaded video file not found. Recent files: ' + recentFiles.join(', '));
      }
      
      const actualFilePath = path.join(uploadDir, downloadedFile);
      const stats = fs.statSync(actualFilePath);
      
      let metadata: any = {
        size: stats.size,
        format: path.extname(downloadedFile).slice(1),
      };
      
      // Read info JSON if available
      if (infoFile) {
        try {
          const infoContent = fs.readFileSync(path.join(uploadDir, infoFile), 'utf8');
          const info = JSON.parse(infoContent);
          
          metadata = {
            ...metadata,
            duration: info.duration || 0,
            originalAuthor: info.uploader || info.channel || 'Unknown',
            originalTitle: info.title || 'Untitled',
            originalDescription: info.description || '',
            publishedAt: info.upload_date ? new Date(info.upload_date) : new Date(),
            thumbnailUrl: info.thumbnail,
            category: info.categories?.[0] || 'Unknown',
            viewCount: info.view_count || 0,
            resolution: info.resolution || `${info.width}x${info.height}` || 'Unknown',
          };
          
          // Clean up info file
          fs.unlinkSync(path.join(uploadDir, infoFile));
        } catch (e) {
          console.log('Could not parse YouTube info JSON:', e.message);
        }
      }
      
      return {
        filePath: actualFilePath,
        filename: downloadedFile,
        title: metadata.originalTitle || 'YouTube Video',
        description: metadata.originalDescription || '',
        metadata,
        mimeType: downloadedFile.includes('.mp4') ? 'video/mp4' : 'video/webm',
        size: stats.size,
        format: path.extname(downloadedFile).slice(1),
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('YouTube download error:', errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('not available')) {
        throw new Error('This YouTube video is not available or may be private.');
      } else if (errorMessage.includes('age')) {
        throw new Error('This YouTube video is age-restricted and cannot be downloaded.');
      } else if (errorMessage.includes('copyright')) {
        throw new Error('This YouTube video is blocked due to copyright restrictions.');
      } else {
        throw new Error(`YouTube download failed: ${errorMessage}`);
      }
    }
  }

  private async downloadFromTwitter(url: string, progressCallback?: (progress: number, message: string) => void): Promise<any> {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const filename = `twitter_${Date.now()}.%(ext)s`;
      const outputPath = path.join(uploadDir, filename);
      
      // Use youtube-dl-exec to download Twitter/X content
      const result = await youtubeDl(url, {
        output: outputPath,
        format: 'best',
        writeInfoJson: true,
      });
      
      // Find the downloaded file
      const files = fs.readdirSync(uploadDir);
      const downloadedFile = files.find(file => file.startsWith('twitter_') && !file.endsWith('.info.json'));
      const infoFile = files.find(file => file.startsWith('twitter_') && file.endsWith('.info.json'));
      
      if (!downloadedFile) {
        throw new Error('Downloaded file not found');
      }
      
      const actualFilePath = path.join(uploadDir, downloadedFile);
      const stats = fs.statSync(actualFilePath);
      
      let metadata: any = {
        size: stats.size,
        format: path.extname(downloadedFile).slice(1),
      };
      
      // Read info JSON if available
      if (infoFile) {
        try {
          const infoContent = fs.readFileSync(path.join(uploadDir, infoFile), 'utf8');
          const info = JSON.parse(infoContent);
          
          metadata = {
            ...metadata,
            originalAuthor: info.uploader || info.channel || 'Unknown',
            originalTitle: info.title || 'Twitter Media',
            originalDescription: info.description || '',
            publishedAt: info.upload_date ? new Date(info.upload_date) : new Date(),
            thumbnailUrl: info.thumbnail,
          };
          
          // Clean up info file
          fs.unlinkSync(path.join(uploadDir, infoFile));
        } catch (e) {
          console.log('Could not parse Twitter info JSON:', e.message);
        }
      }
      
      return {
        filePath: actualFilePath,
        filename: downloadedFile,
        title: metadata.originalTitle || 'Twitter Media',
        description: metadata.originalDescription || '',
        metadata,
        mimeType: downloadedFile.includes('.mp4') ? 'video/mp4' : 'image/jpeg',
        size: stats.size,
        format: path.extname(downloadedFile).slice(1),
      };
    } catch (error) {
      throw new Error(`Twitter download failed: ${(error as Error).message}`);
    }
  }

  private async downloadFromSoundCloud(url: string, progressCallback?: (progress: number, message: string) => void): Promise<any> {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      progressCallback?.(0, 'Fetching track information...');
      
      // Get track info first to validate the URL and get metadata
      let trackInfo: any = {};
      try {
        trackInfo = await scdl.getInfo(url);
        progressCallback?.(10, 'Track information retrieved');
      } catch (e) {
        console.error('Failed to get track info:', e);
        throw new Error('Unable to retrieve track information. The track may be private or unavailable.');
      }

      // Validate that the track is downloadable
      if (!trackInfo || !trackInfo.id) {
        throw new Error('Invalid track data received from SoundCloud');
      }

      progressCallback?.(20, 'Starting download...');
      
      const filename = `soundcloud_${Date.now()}_${trackInfo.id}.mp3`;
      const filePath = path.join(uploadDir, filename);
      const tempFilePath = `${filePath}.tmp`;

      // Download with better stream handling
      const stream = await scdl.download(url);
      
      if (!stream) {
        throw new Error('Failed to get download stream from SoundCloud');
      }

      // Set up write stream with better error handling
      const writeStream = fs.createWriteStream(tempFilePath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let lastDataTime = Date.now();
      let corruptionWarnings = 0;
      
      // Estimate total bytes from track duration (rough estimation)
      if (trackInfo.duration) {
        // Assume ~128kbps MP3 = ~16KB/second
        totalBytes = Math.floor((trackInfo.duration / 1000) * 16 * 1024);
      }

      console.log(`Starting SoundCloud download: ${url}`);
      console.log(`Track ID: ${trackInfo.id}, Estimated size: ${totalBytes} bytes`);

      // Track download progress and detect corruption patterns
      stream.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        lastDataTime = Date.now();
        
        // Check for suspicious data patterns
        const nullBytes = chunk.filter(byte => byte === 0).length;
        const nullPercentage = (nullBytes / chunk.length) * 100;
        
        if (nullPercentage > 80) {
          corruptionWarnings++;
          if (corruptionWarnings <= 2) { // Reduced from 3 to 2
            console.warn(`⚠️ SoundCloud corruption detected: ${nullPercentage.toFixed(1)}% null bytes in chunk`);
          }
        }
        
        if (totalBytes > 0) {
          const progress = Math.min(Math.floor((downloadedBytes / totalBytes) * 70) + 20, 90);
          progressCallback?.(progress, `Downloading... ${Math.floor(downloadedBytes / 1024)}KB`);
        }
      });

      // Pipe stream with proper error handling
      stream.pipe(writeStream, { end: true });

      // Handle stream completion and errors
      await new Promise<void>((resolve, reject) => {
        let resolved = false;

        const cleanup = () => {
          if (fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              console.warn('Failed to cleanup temp file:', e);
            }
          }
        };

        const resolveOnce = () => {
          if (!resolved) {
            resolved = true;
            console.log(`✅ SoundCloud download completed: ${downloadedBytes} bytes${corruptionWarnings > 0 ? `, ${corruptionWarnings} corruption warnings` : ''}`);
            resolve();
          }
        };

        const rejectOnce = (error: Error) => {
          if (!resolved) {
            resolved = true;
            console.error(`❌ SoundCloud download failed: ${error.message}`);
            cleanup();
            reject(error);
          }
        };

        // Monitor for stalled downloads
        const stallInterval = setInterval(() => {
          const timeSinceLastData = Date.now() - lastDataTime;
          if (timeSinceLastData > 30000) { // 30 seconds without data
            clearInterval(stallInterval);
            rejectOnce(new Error(`Download stalled: no data received for ${timeSinceLastData}ms`));
          }
        }, 5000);

        // Handle write stream events
        writeStream.on('finish', () => {
          clearInterval(stallInterval);
          
          // Check if we got expected amount of data
          if (totalBytes > 0 && downloadedBytes < totalBytes * 0.5) {
            rejectOnce(new Error(`Download incomplete: got ${downloadedBytes} bytes, expected ~${totalBytes} bytes`));
            return;
          }
          
          // Check corruption warnings threshold
          if (corruptionWarnings > 10) {
            rejectOnce(new Error(`Too many corruption warnings during download: ${corruptionWarnings}`));
            return;
          }
          
          progressCallback?.(90, 'Download completed, verifying...');
          resolveOnce();
        });

        writeStream.on('error', (error) => {
          clearInterval(stallInterval);
          console.error('Write stream error:', error);
          rejectOnce(new Error(`Failed to write file: ${error.message}`));
        });

        // Handle read stream errors
        stream.on('error', (error) => {
          clearInterval(stallInterval);
          console.error('Download stream error:', error);
          rejectOnce(new Error(`Download failed: ${error.message}`));
        });

        // Timeout protection (10 minutes max)
        const timeout = setTimeout(() => {
          clearInterval(stallInterval);
          rejectOnce(new Error('Download timeout - operation took too long'));
        }, 10 * 60 * 1000);

        // Clear timeout when done
        const clearTimeoutOnce = () => {
          clearTimeout(timeout);
          clearInterval(stallInterval);
        };
        
        writeStream.on('finish', clearTimeoutOnce);
        writeStream.on('error', clearTimeoutOnce);
        stream.on('error', clearTimeoutOnce);
      });

      // Verify the downloaded file
      if (!fs.existsSync(tempFilePath)) {
        throw new Error('Downloaded file not found after completion');
      }

      const stats = fs.statSync(tempFilePath);
      
      // Basic integrity checks
      if (stats.size === 0) {
        fs.unlinkSync(tempFilePath);
        throw new Error('Downloaded file is empty');
      }

      if (stats.size < 1024) { // Less than 1KB is suspicious for audio
        fs.unlinkSync(tempFilePath);
        throw new Error('Downloaded file is too small to be valid audio');
      }

      progressCallback?.(92, 'Validating file integrity...');

      // Advanced file validation
      const validation = await this.validateAudioFile(tempFilePath);
      
      if (!validation.isValid) {
        console.error(`❌ SoundCloud file validation failed: ${validation.reason}`);
        fs.unlinkSync(tempFilePath);
        
        // Try alternative method if validation fails and we haven't tried it yet
        throw new Error(`Downloaded file is corrupted: ${validation.reason}`);
      }

      // Log successful validation (concise)
      console.log(`✅ SoundCloud file validated: ${Math.floor(validation.fileInfo.size / 1024)}KB, ${validation.fileInfo.nullPercentage}% null bytes`);

      // Move temp file to final location
      fs.renameSync(tempFilePath, filePath);

      progressCallback?.(95, 'File verification completed');

      const metadata = {
        size: stats.size,
        format: 'mp3',
        duration: trackInfo.duration ? Math.floor(trackInfo.duration / 1000) : 0,
        originalAuthor: trackInfo.user?.username || 'Unknown',
        originalTitle: trackInfo.title || 'SoundCloud Track',
        originalDescription: trackInfo.description || '',
        publishedAt: trackInfo.created_at ? new Date(trackInfo.created_at) : new Date(),
        thumbnailUrl: trackInfo.artwork_url,
        genre: trackInfo.genre,
        playCount: trackInfo.playback_count || 0,
      };

      progressCallback?.(100, 'Download completed successfully');

      return {
        filePath,
        filename,
        title: metadata.originalTitle,
        description: metadata.originalDescription,
        metadata,
        mimeType: 'audio/mpeg',
        size: stats.size,
        format: 'mp3',
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('SoundCloud download error:', errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('private') || errorMessage.includes('not found')) {
        throw new Error('This SoundCloud track is private or has been removed.');
      } else if (errorMessage.includes('timeout')) {
        throw new Error('Download timed out. Please try again later.');
      } else if (errorMessage.includes('stream')) {
        throw new Error('Failed to download audio stream. The track may be corrupted or unavailable.');
      } else {
        throw new Error(`SoundCloud download failed: ${errorMessage}`);
      }
    }
  }

  // Alternative SoundCloud download method using soundcloud.ts (more reliable)
  private async downloadFromSoundCloudAlternative(url: string, progressCallback?: (progress: number, message: string) => void): Promise<any> {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      progressCallback?.(0, 'Initializing SoundCloud API...');

      // Initialize SoundCloud client
      const soundcloud = new Soundcloud();

      progressCallback?.(10, 'Fetching track information...');

      // Get track information
      const track = await soundcloud.tracks.get(url);
      
      if (!track || !track.id) {
        throw new Error('Track not found or is private');
      }

      if (!track.streamable) {
        throw new Error('Track is not streamable');
      }

      progressCallback?.(20, 'Track information retrieved');

      const filename = `soundcloud_${Date.now()}_${track.id}.mp3`;
      const filePath = path.join(uploadDir, filename);
      const tempFilePath = `${filePath}.tmp`;

      progressCallback?.(30, 'Starting download...');

      // Use the utility function to download the track
      try {
        // Download the track using soundcloud.ts stream method
        const stream = await soundcloud.util.streamTrack(url);
        
        if (!stream) {
          throw new Error('Failed to get download stream');
        }

        const writeStream = fs.createWriteStream(tempFilePath);
        let downloadedBytes = 0;
        let lastDataTime = Date.now();
        let corruptionWarnings = 0;
        
        // Estimate total bytes (rough calculation)
        const estimatedTotalBytes = track.duration ? Math.floor((track.duration / 1000) * 16 * 1024) : 0;
        const totalBytes = estimatedTotalBytes;

        console.log(`Starting SoundCloud alternative download: ${url}`);
        console.log(`Track ID: ${track.id}, Estimated size: ${totalBytes} bytes`);

        // Track download progress
        stream.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          lastDataTime = Date.now();
          
          // Check for suspicious data patterns
          const nullBytes = chunk.filter(byte => byte === 0).length;
          const nullPercentage = (nullBytes / chunk.length) * 100;
          
          if (nullPercentage > 80) {
            corruptionWarnings++;
            if (corruptionWarnings <= 2) { // Reduced from 3 to 2
              console.warn(`⚠️ SoundCloud corruption detected: ${nullPercentage.toFixed(1)}% null bytes in chunk`);
            }
          }
          
          if (estimatedTotalBytes > 0) {
            const progress = Math.min(Math.floor((downloadedBytes / estimatedTotalBytes) * 60) + 30, 90);
            progressCallback?.(progress, `Downloading... ${Math.floor(downloadedBytes / 1024)}KB`);
          }
        });

        // Pipe with proper error handling
        stream.pipe(writeStream, { end: true });

        await new Promise<void>((resolve, reject) => {
          let resolved = false;

          const cleanup = () => {
            if (fs.existsSync(tempFilePath)) {
              try {
                fs.unlinkSync(tempFilePath);
              } catch (e) {
                console.warn('Failed to cleanup temp file:', e);
              }
            }
          };

          const resolveOnce = () => {
            if (!resolved) {
              resolved = true;
              console.log(`✅ SoundCloud download completed: ${downloadedBytes} bytes${corruptionWarnings > 0 ? `, ${corruptionWarnings} corruption warnings` : ''}`);
              resolve();
            }
          };

          const rejectOnce = (error: Error) => {
            if (!resolved) {
              resolved = true;
              console.error(`❌ SoundCloud download failed: ${error.message}`);
              cleanup();
              reject(error);
            }
          };

          // Monitor for stalled downloads
          const stallInterval = setInterval(() => {
            const timeSinceLastData = Date.now() - lastDataTime;
            if (timeSinceLastData > 30000) { // 30 seconds without data
              clearInterval(stallInterval);
              rejectOnce(new Error(`Download stalled: no data received for ${timeSinceLastData}ms`));
            }
          }, 5000);

          // Handle write stream events
          writeStream.on('finish', () => {
            clearInterval(stallInterval);
            
            // Check if we got expected amount of data
            if (totalBytes > 0 && downloadedBytes < totalBytes * 0.5) {
              rejectOnce(new Error(`Download incomplete: got ${downloadedBytes} bytes, expected ~${totalBytes} bytes`));
              return;
            }
            
            // Check corruption warnings threshold
            if (corruptionWarnings > 10) {
              rejectOnce(new Error(`Too many corruption warnings during download: ${corruptionWarnings}`));
              return;
            }
            
            progressCallback?.(90, 'Download completed, verifying...');
            resolveOnce();
          });

          writeStream.on('error', (error) => {
            clearInterval(stallInterval);
            console.error('Write stream error:', error);
            rejectOnce(new Error(`Failed to write file: ${error.message}`));
          });

          // Handle read stream errors
          stream.on('error', (error) => {
            clearInterval(stallInterval);
            console.error('Download stream error:', error);
            rejectOnce(new Error(`Download failed: ${error.message}`));
          });

          // Timeout protection (10 minutes max)
          const timeout = setTimeout(() => {
            clearInterval(stallInterval);
            rejectOnce(new Error('Download timeout - operation took too long'));
          }, 10 * 60 * 1000);

          // Clear timeout when done
          const clearTimeoutOnce = () => {
            clearTimeout(timeout);
            clearInterval(stallInterval);
          };
          
          writeStream.on('finish', clearTimeoutOnce);
          writeStream.on('error', clearTimeoutOnce);
          stream.on('error', clearTimeoutOnce);
        });

        // Verify the downloaded file
        if (!fs.existsSync(tempFilePath)) {
          throw new Error('Downloaded file not found after completion');
        }

        const stats = fs.statSync(tempFilePath);
        
        // Basic integrity checks
        if (stats.size === 0) {
          fs.unlinkSync(tempFilePath);
          throw new Error('Downloaded file is empty');
        }

        if (stats.size < 1024) {
          fs.unlinkSync(tempFilePath);
          throw new Error('Downloaded file is too small to be valid audio');
        }

        progressCallback?.(92, 'Validating file integrity...');

        // Advanced file validation
        const validation = await this.validateAudioFile(tempFilePath);
        
        if (!validation.isValid) {
          console.error(`❌ SoundCloud file validation failed: ${validation.reason}`);
          fs.unlinkSync(tempFilePath);
          
          // Try alternative method if validation fails and we haven't tried it yet
          throw new Error(`Downloaded file is corrupted: ${validation.reason}`);
        }

        // Log successful validation (concise)
        console.log(`✅ SoundCloud file validated: ${Math.floor(validation.fileInfo.size / 1024)}KB, ${validation.fileInfo.nullPercentage}% null bytes`);

        // Move temp file to final location
        fs.renameSync(tempFilePath, filePath);

        progressCallback?.(95, 'File verification completed');

        const metadata = {
          size: stats.size,
          format: 'mp3',
          duration: track.duration ? Math.floor(track.duration / 1000) : 0,
          originalAuthor: track.user?.username || 'Unknown',
          originalTitle: track.title || 'SoundCloud Track',
          originalDescription: track.description || '',
          publishedAt: track.created_at ? new Date(track.created_at) : new Date(),
          thumbnailUrl: track.artwork_url,
          genre: track.genre,
          playCount: track.playback_count || 0,
        };

        progressCallback?.(100, 'Download completed successfully');

        return {
          filePath,
          filename,
          title: metadata.originalTitle,
          description: metadata.originalDescription,
          metadata,
          mimeType: 'audio/mpeg',
          size: stats.size,
          format: 'mp3',
        };
      } catch (downloadError) {
        console.error('soundcloud.ts download failed:', downloadError);
        throw new Error(`Failed to download with soundcloud.ts: ${(downloadError as Error).message}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('SoundCloud alternative download error:', errorMessage);
      
      if (errorMessage.includes('not found') || errorMessage.includes('private')) {
        throw new Error('This SoundCloud track is private, deleted, or not found.');
      } else if (errorMessage.includes('streamable')) {
        throw new Error('This SoundCloud track is not available for streaming.');
      } else if (errorMessage.includes('timeout')) {
        throw new Error('Download timed out. Please try again later.');
      } else {
        throw new Error(`SoundCloud download failed: ${errorMessage}`);
      }
    }
  }

  async processDirectUpload(params: {
    file: Express.Multer.File;
    userId: string;
    title: string;
    description?: string;
    visibility: Visibility;
    tags: string[];
    jobId?: string;
  }): Promise<{ jobId: string; mediaItem: MediaItem }> {
    const jobId = params.jobId || uuidv4();
    
    try {
      if (uploadCancellationService.isCancelled(jobId)) {
        uploadCancellationService.acknowledge(jobId);
        throw createError('Upload cancelled by user before start.', 499);
      }

      // Check storage limit before proceeding
      const { hasSpace, currentUsage, limit } = await checkStorageLimit(params.userId);
      const fileSize = params.file.size;
      
      if (!hasSpace || (currentUsage + fileSize) > limit) {
        throw createError('Storage limit reached. Please free up space before uploading.', 413);
      }

      const dbUserId = await this.ensureUserExists(params.userId);
      
      const uploadResult = await this.backblazeService.uploadFile(
        params.file.path,
        params.file.originalname,
        params.userId,
        jobId
      );

      if (uploadCancellationService.isCancelled(jobId)) {
        // Cleanup B2 file
        await this.backblazeService.deleteFile(uploadResult.fileId);
        uploadCancellationService.acknowledge(jobId);
        throw createError('Upload cancelled by user after cloud upload.', 499);
      }
      
      this.emitUploadProgress(params.userId, jobId, 'gemini', 0, 'Generating AI metadata...');
      
      const aiMetadata = await this.geminiService.generateMetadataFromFile(params.file.path);
      
      this.emitUploadProgress(params.userId, jobId, 'gemini', 100, 'AI metadata generated.');
      
      // Create media item with flattened metadata structure
      const mediaItemData = {
        id: uuidv4(),
        userId: dbUserId,
        originalUrl: 'direct-upload',
        platform: 'DIRECT' as Platform,
        title: params.title,
        description: params.description,
        visibility: params.visibility,
        tags: params.tags,
        downloadStatus: 'COMPLETED' as DownloadStatus,
        publicId: params.visibility === 'PUBLIC' ? uuidv4() : undefined,
        size: BigInt(params.file.size),
        format: path.extname(params.file.originalname).slice(1),
        aiSummary: aiMetadata?.summary,
        aiKeywords: aiMetadata?.keywords || [],
        aiGeneratedAt: aiMetadata ? new Date() : undefined,
        // Caption status - initially pending
        captionStatus: 'PENDING' as any,
      };

      const mediaItem = await prisma.mediaItem.create({
        data: mediaItemData,
        include: {
          files: true,
        },
      });

      await prisma.mediaFile.create({
        data: {
          id: uuidv4(),
          mediaItemId: mediaItem.id,
          filename: uploadResult.filename,
          originalName: params.file.originalname,
          mimeType: params.file.mimetype,
          size: BigInt(params.file.size),
          b2FileId: uploadResult.fileId,
          b2FileName: uploadResult.fileName,
          downloadUrl: uploadResult.downloadUrl,
          isOriginal: true,
          format: path.extname(params.file.originalname).slice(1),
        },
      });
      
      // Add caption generation job to queue instead of generating directly
      if (params.file.mimetype.includes('video') || params.file.mimetype.includes('audio')) {
        try {
          this.emitUploadProgress(params.userId, jobId, 'transcription', 90, 'Adding to caption queue...');
          
          await this.captionJobService.addJob(mediaItem.id, params.userId, 0);
          
          this.emitUploadProgress(params.userId, jobId, 'transcription', 95, 'Added to caption queue', 'Captions will be generated automatically');
        } catch (error) {
          console.error('Failed to add caption job:', error);
          // Don't fail the entire upload for caption queue issues
        }
      } else {
        // Skip caption generation for non-audio/video content
        await prisma.mediaItem.update({
          where: { id: mediaItem.id },
          data: { captionStatus: 'SKIPPED' as any }
        });
      }
      
      if (fs.existsSync(params.file.path)) {
        fs.unlinkSync(params.file.path);
      }
      
      const serializedMediaItem = this.serializeMediaItem(mediaItem);
      
      this.emitUploadProgress(params.userId, jobId, 'complete', 100, 'All processing completed!', 'Your media is ready', false, mediaItem.id);
      
      return { jobId, mediaItem: serializedMediaItem };
    } catch (error) {
      if ((error as any).statusCode === 499) {
        console.log(`Job ${jobId} was cancelled as requested.`);
      } else {
        this.emitUploadProgress(params.userId, jobId, 'error', 100, 'Upload Process Failed', (error as Error).message, true);
      }
      
      if (fs.existsSync(params.file.path)) {
        fs.unlinkSync(params.file.path);
      }
      throw error;
    }
  }

  async getMediaItem(id: string, userId: string): Promise<MediaItem | null> {
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userId);
    
    const mediaItem = await prisma.mediaItem.findFirst({
      where: {
        id: id,
        userId: dbUserId,
      },
      include: {
        files: true,
      },
    });
    
    return mediaItem ? this.serializeMediaItem(mediaItem) : null;
  }

  async updateMediaItem(id: string, userId: string, updates: {
    title?: string;
    description?: string;
    visibility?: Visibility;
    tags?: string[];
  }): Promise<MediaItem> {
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userId);
    
    const mediaItem = await prisma.mediaItem.update({
      where: {
        id: id,
        userId: dbUserId,
      },
      data: updates,
      include: {
        files: true,
      },
    });
    
    return this.serializeMediaItem(mediaItem);
  }

  async deleteMediaItem(id: string, userId: string): Promise<void> {
    // Convert OAuth UID to database user ID
    const dbUserId = await this.ensureUserExists(userId);
    
    // Get media item to access files for cleanup
    const mediaItem = await prisma.mediaItem.findFirst({
      where: {
        id: id,
        userId: dbUserId,
      },
      include: {
        files: true,
      },
    });
    
    if (!mediaItem) {
      throw new Error('Media item not found');
    }
    
    // Delete files from Backblaze B2
    for (const file of mediaItem.files) {
      try {
        await this.backblazeService.deleteFile(file.b2FileId);
      } catch (error) {
        console.error('Error deleting file from B2:', error);
      }
    }
    
    // Delete from database (Prisma will handle cascading deletes)
    await prisma.mediaItem.delete({
      where: {
        id: id,
        userId: dbUserId,
      },
    });
  }

  // Emit progress update to user via Socket.IO for URL downloads
  private emitDownloadProgress(
    userId: string, 
    jobId: string, 
    status: DownloadStatus, 
    progress: number, 
    message: string,
    mediaItem?: any
  ): void {
    const progressData = {
      jobId,
      status,
      progress,
      message,
      mediaItem,
      timestamp: new Date().toISOString()
    };
    
    if (this.io) {
      this.io.to(`user:${userId}`).emit('download-progress', progressData);
    }
  }

  // Emit progress update to user via Socket.IO for uploads
  private emitUploadProgress(
    userId: string, 
    jobId: string, 
    stage: 'upload' | 'download' | 'b2' | 'gemini' | 'transcription' | 'complete' | 'error', 
    progress: number, 
    message: string,
    details?: string,
    error?: boolean,
    mediaId?: string
  ): void {
    const progressData = {
      jobId,
      stage,
      progress,
      message,
      details,
      error,
      mediaId,
      timestamp: new Date().toISOString()
    };
    
    if (this.io) {
      this.io.to(`user:${userId}`).emit('upload-progress', progressData);
    }
  }

  // Advanced file validation for audio files
  private async validateAudioFile(filePath: string): Promise<{ isValid: boolean; reason?: string; fileInfo?: any }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { isValid: false, reason: 'File does not exist' };
      }

      const stats = fs.statSync(filePath);
      
      // Basic size checks
      if (stats.size === 0) {
        return { isValid: false, reason: 'File is empty' };
      }

      if (stats.size < 1024) {
        return { isValid: false, reason: 'File too small (< 1KB)' };
      }

      // Read first 32 bytes to check file signature
      const buffer = Buffer.alloc(32);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 32, 0);
      fs.closeSync(fd);

      // Check for valid audio file headers
      const isMP3 = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0; // MP3 frame sync
      const isID3 = buffer.toString('ascii', 0, 3) === 'ID3'; // ID3 tag
      const isValidMP3 = isMP3 || isID3;

      if (!isValidMP3) {
        return { 
          isValid: false, 
          reason: `Invalid audio file header. Expected MP3 but got: ${buffer.toString('hex', 0, 8)}` 
        };
      }

      // Calculate MD5 hash for integrity
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      const md5Hash = hash.digest('hex');

      // Check for suspicious patterns that might indicate corruption
      const fullBuffer = fs.readFileSync(filePath);
      const nullBytes = fullBuffer.filter(byte => byte === 0).length;
      const nullPercentage = (nullBytes / fullBuffer.length) * 100;

      if (nullPercentage > 50) {
        return { 
          isValid: false, 
          reason: `File appears corrupted: ${nullPercentage.toFixed(1)}% null bytes` 
        };
      }

      return {
        isValid: true,
        fileInfo: {
          size: stats.size,
          md5Hash,
          nullPercentage: nullPercentage.toFixed(2),
          header: buffer.toString('hex', 0, 16)
        }
      };

    } catch (error) {
      return { 
        isValid: false, 
        reason: `Validation error: ${(error as Error).message}` 
      };
    }
  }

  async processBatchDownload(params: {
    userId: string;
    urls: string[];
    platform: Platform;
    visibility: Visibility;
    tags: string[];
  }): Promise<{ jobId: string; mediaItems: MediaItem[] }> {
    const batchJobId = uuidv4(); // Main batch job ID
    const results: MediaItem[] = [];
    const errors: string[] = [];
    
    try {
      this.emitUploadProgress(params.userId, batchJobId, 'download', 0, `Starting batch download of ${params.urls.length} URLs...`);
      
      const dbUserId = await this.ensureUserExists(params.userId);
      
      // Process URLs in parallel with limited concurrency
      const CONCURRENT_DOWNLOADS = 3; // Limit concurrent downloads
      const chunks = [];
      for (let i = 0; i < params.urls.length; i += CONCURRENT_DOWNLOADS) {
        chunks.push(params.urls.slice(i, i + CONCURRENT_DOWNLOADS));
      }
      
      let completedCount = 0;
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (url, index) => {
          const individualJobId = uuidv4();
          const progressOffset = completedCount + index;
          try {
            const progressCallback = (progress: number, message: string) => {
              const overallProgress = Math.floor(((progressOffset + progress / 100) / params.urls.length) * 80);
              this.emitUploadProgress(params.userId, individualJobId, 'download', overallProgress, 
                `Processing ${progressOffset + 1}/${params.urls.length}: ${message}`);
            };
            
            const downloadResult = await this.downloadFromPlatform(url, params.platform, progressCallback);
            
            this.emitUploadProgress(params.userId, individualJobId, 'b2', 0, `Uploading ${progressOffset + 1}/${params.urls.length} to cloud...`);
            
            const uploadResult = await this.backblazeService.uploadFile(
              downloadResult.filePath,
              downloadResult.filename,
              params.userId,
              individualJobId
            );

            if (uploadCancellationService.isCancelled(batchJobId)) {
              await this.backblazeService.deleteFile(uploadResult.fileId);
              throw createError('Batch upload cancelled by user.', 499);
            }
            
            this.emitUploadProgress(params.userId, individualJobId, 'gemini', 0, `Generating metadata for ${progressOffset + 1}/${params.urls.length}...`);
            
            const aiMetadata = await this.geminiService.generateMetadataFromFile(downloadResult.filePath);
            
            // Create media item with auto-generated title
            const mediaItemData = {
              id: uuidv4(),
              userId: dbUserId,
              originalUrl: url,
              platform: params.platform,
              title: downloadResult.title || downloadResult.metadata?.originalTitle || `Download ${progressOffset + 1}`,
              description: downloadResult.description || downloadResult.metadata?.originalDescription,
              visibility: params.visibility,
              tags: params.tags,
              downloadStatus: 'COMPLETED' as DownloadStatus,
              publicId: params.visibility === 'PUBLIC' ? uuidv4() : undefined,
              duration: downloadResult.metadata?.duration,
              size: BigInt(downloadResult.size || 0),
              format: downloadResult.format,
              resolution: downloadResult.metadata?.resolution,
              thumbnailUrl: downloadResult.metadata?.thumbnailUrl,
              originalAuthor: downloadResult.metadata?.originalAuthor,
              originalTitle: downloadResult.metadata?.originalTitle,
              originalDescription: downloadResult.metadata?.originalDescription,
              publishedAt: downloadResult.metadata?.publishedAt,
              hashtags: downloadResult.metadata?.hashtags || [],
              aiSummary: aiMetadata?.summary,
              aiKeywords: aiMetadata?.keywords || [],
              aiGeneratedAt: aiMetadata ? new Date() : undefined,
              captionStatus: 'PENDING' as any,
            };

            const mediaItem = await prisma.mediaItem.create({
              data: mediaItemData,
              include: { files: true },
            });

            await prisma.mediaFile.create({
              data: {
                id: uuidv4(),
                mediaItemId: mediaItem.id,
                filename: uploadResult.filename,
                originalName: downloadResult.filename,
                mimeType: downloadResult.mimeType,
                size: BigInt(downloadResult.size || 0),
                b2FileId: uploadResult.fileId,
                b2FileName: uploadResult.fileName,
                downloadUrl: uploadResult.downloadUrl,
                isOriginal: true,
                format: downloadResult.format,
              },
            });
            
            // Add caption generation job
            if (downloadResult.mimeType.includes('video') || downloadResult.mimeType.includes('audio')) {
              try {
                await this.captionJobService.addJob(mediaItem.id, params.userId, 0);
              } catch (error) {
                console.error('Failed to add caption job:', error);
              }
            } else {
              await prisma.mediaItem.update({
                where: { id: mediaItem.id },
                data: { captionStatus: 'SKIPPED' as any }
              });
            }
            
            // Clean up temporary file
            if (fs.existsSync(downloadResult.filePath)) {
              fs.unlinkSync(downloadResult.filePath);
            }
            
            this.emitUploadProgress(params.userId, individualJobId, 'complete', 100, 
              `Completed ${progressOffset + 1}/${params.urls.length}`, undefined, false, mediaItem.id);
            
            return this.serializeMediaItem(mediaItem);
          } catch (error) {
            console.error(`Failed to process URL ${progressOffset + 1}:`, error);
            errors.push(`URL ${progressOffset + 1}: ${(error as Error).message}`);
            this.emitUploadProgress(params.userId, individualJobId, 'error', 100, 
              `Failed ${progressOffset + 1}/${params.urls.length}`, (error as Error).message, true);
            return null;
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults.filter(result => result !== null) as MediaItem[]);
        completedCount += chunk.length;
      }
      
      const successCount = results.length;
      const failureCount = errors.length;
      
      if (successCount > 0) {
        this.emitUploadProgress(params.userId, batchJobId, 'complete', 100, 
          `Batch complete: ${successCount} successful, ${failureCount} failed`, 
          failureCount > 0 ? `Errors: ${errors.join('; ')}` : undefined);
      } else {
        this.emitUploadProgress(params.userId, batchJobId, 'error', 100, 
          'All downloads failed', errors.join('; '), true);
      }
      
      return { jobId: batchJobId, mediaItems: results };
      
    } catch (error) {
      console.error('Batch download error:', error);
      this.emitUploadProgress(params.userId, batchJobId, 'error', 100, 'Batch download failed', (error as Error).message, true);
      throw error;
    }
  }

  async processBatchDirectUpload(params: {
    files: Express.Multer.File[];
    userId: string;
    description?: string;
    visibility: Visibility;
    tags: string[];
    jobId?: string;
  }): Promise<{ jobId: string; mediaItems: MediaItem[] }> {
    const batchJobId = params.jobId || uuidv4();
    const results: MediaItem[] = [];
    const errors: string[] = [];
    
    try {
      // Check storage limit before proceeding
      const { hasSpace, currentUsage, limit } = await checkStorageLimit(params.userId);
      const totalUploadSize = params.files.reduce((sum, file) => sum + file.size, 0);
      
      if (!hasSpace || (currentUsage + totalUploadSize) > limit) {
        throw createError('Storage limit reached. Please free up space before uploading.', 413);
      }

      if (uploadCancellationService.isCancelled(batchJobId)) {
        uploadCancellationService.acknowledge(batchJobId);
        throw createError('Batch upload cancelled by user before start.', 499);
      }

      this.emitUploadProgress(params.userId, batchJobId, 'upload', 0, `Starting batch upload of ${params.files.length} files...`);
      
      // Process files in parallel with limited concurrency
      const CONCURRENT_UPLOADS = 2; // Limit concurrent uploads
      const chunks = [];
      for (let i = 0; i < params.files.length; i += CONCURRENT_UPLOADS) {
        chunks.push(params.files.slice(i, i + CONCURRENT_UPLOADS));
      }
      
      let completedCount = 0;
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (file, index) => {
          const individualJobId = uuidv4();
          const progressOffset = completedCount + index;
          
          try {
            const progressCallback = (stage: string, progress: number, message: string) => {
              const overallProgress = Math.floor(((progressOffset + progress / 100) / params.files.length) * 80);
              this.emitUploadProgress(params.userId, individualJobId, stage as any, overallProgress, 
                `Processing ${progressOffset + 1}/${params.files.length}: ${message}`);
            };
            
            progressCallback('upload', 0, 'Uploading to cloud storage...');
            
            const uploadResult = await this.backblazeService.uploadFile(
              file.path,
              file.originalname,
              params.userId,
              individualJobId
            );

            if (uploadCancellationService.isCancelled(batchJobId)) {
              await this.backblazeService.deleteFile(uploadResult.fileId);
              uploadCancellationService.acknowledge(batchJobId);
              throw createError('Batch upload cancelled by user after cloud upload.', 499);
            }
            
            progressCallback('gemini', 50, 'Generating AI metadata...');
            
            const aiMetadata = await this.geminiService.generateMetadataFromFile(file.path);
            
            progressCallback('gemini', 80, 'AI metadata generated');
            
            // Auto-generate title from filename
            const autoTitle = file.originalname.replace(/\.[^/.]+$/, '');
            
            const mediaItemData = {
              id: uuidv4(),
              userId: params.userId,
              originalUrl: 'direct-upload',
              platform: 'DIRECT' as Platform,
              title: autoTitle,
              description: params.description,
              visibility: params.visibility,
              tags: params.tags,
              downloadStatus: 'COMPLETED' as DownloadStatus,
              publicId: params.visibility === 'PUBLIC' ? uuidv4() : undefined,
              size: BigInt(file.size),
              format: path.extname(file.originalname).slice(1),
              aiSummary: aiMetadata?.summary,
              aiKeywords: aiMetadata?.keywords || [],
              aiGeneratedAt: aiMetadata ? new Date() : undefined,
              captionStatus: 'PENDING' as any,
            };

            const mediaItem = await prisma.mediaItem.create({
              data: mediaItemData,
              include: { files: true },
            });

            await prisma.mediaFile.create({
              data: {
                id: uuidv4(),
                mediaItemId: mediaItem.id,
                filename: uploadResult.filename,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: BigInt(file.size),
                b2FileId: uploadResult.fileId,
                b2FileName: uploadResult.fileName,
                downloadUrl: uploadResult.downloadUrl,
                isOriginal: true,
                format: path.extname(file.originalname).slice(1),
              },
            });
            
            // Add caption generation job
            if (file.mimetype.includes('video') || file.mimetype.includes('audio')) {
              try {
                await this.captionJobService.addJob(mediaItem.id, params.userId, 0);
                progressCallback('transcription', 90, 'Added to caption queue');
              } catch (error) {
                console.error('Failed to add caption job:', error);
              }
            } else {
              await prisma.mediaItem.update({
                where: { id: mediaItem.id },
                data: { captionStatus: 'SKIPPED' as any }
              });
            }
            
            // Clean up temporary file
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
            
            this.emitUploadProgress(params.userId, individualJobId, 'complete', 100, 
              `Completed ${progressOffset + 1}/${params.files.length}`, undefined, false, mediaItem.id);
            
            return this.serializeMediaItem(mediaItem);
          } catch (error) {
            console.error(`Failed to process file ${progressOffset + 1}:`, error);
            errors.push(`File ${progressOffset + 1} (${file.originalname}): ${(error as Error).message}`);
            
            // Clean up temporary file on error
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
            
            this.emitUploadProgress(params.userId, individualJobId, 'error', 100, 
              `Failed ${progressOffset + 1}/${params.files.length}`, (error as Error).message, true);
            return null;
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults.filter(result => result !== null) as MediaItem[]);
        completedCount += chunk.length;
      }
      
      const successCount = results.length;
      const failureCount = errors.length;
      
      if (successCount > 0) {
        this.emitUploadProgress(params.userId, batchJobId, 'complete', 100, 
          `Batch complete: ${successCount} successful, ${failureCount} failed`, 
          failureCount > 0 ? `Errors: ${errors.join('; ')}` : undefined);
      } else {
        this.emitUploadProgress(params.userId, batchJobId, 'error', 100, 
          'All uploads failed', errors.join('; '), true);
      }
      
      return { jobId: batchJobId, mediaItems: results };
      
    } catch (error) {
      if ((error as any).statusCode === 499) {
        console.log(`Batch job ${batchJobId} was cancelled as requested.`);
      } else {
        this.emitUploadProgress(params.userId, batchJobId, 'error', 100, 'Batch upload failed', (error as Error).message, true);
      }
      
      // Clean up any remaining temp files
      params.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      
      throw error;
    }
  }
} 