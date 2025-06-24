import { getFirestore } from 'firebase-admin/firestore';
import ytdl from 'ytdl-core';
import youtubeDl from 'youtube-dl-exec';
import scdl from 'soundcloud-downloader';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem, DownloadJob, Platform, DownloadStatus } from '../types';
import { BackblazeService } from './BackblazeService';
import { GeminiService } from './GeminiService';
import { createError } from '../middleware/errorHandler';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class MediaDownloadService {
  private db = getFirestore();
  private backblazeService = new BackblazeService();
  private geminiService = new GeminiService();
  private io?: any; // Use any type to avoid import issues

  constructor(io?: any) {
    this.io = io;
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

  async processDownloadImmediate(params: {
    userId: string;
    url: string;
    platform: Platform;
    visibility: 'private' | 'public';
    tags: string[];
  }): Promise<{ jobId: string; mediaItem?: MediaItem }> {
    const jobId = uuidv4();
    
    const job: DownloadJob = {
      id: jobId,
      userId: params.userId,
      url: params.url,
      platform: params.platform,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
    };
    
    await this.db.collection('downloadJobs').doc(jobId).set(job);
    this.emitProgress(params.userId, jobId, 'pending', 0, 'Starting download...');
    
    try {
      this.emitProgress(params.userId, jobId, 'downloading', 5, 'Initializing download...');
      
      // Download media based on platform
      const downloadResult = await this.downloadFromPlatform(params.url, params.platform, (progress, message) => {
        this.emitProgress(params.userId, jobId, 'downloading', 5 + (progress * 0.45), message);
      });
      
      this.emitProgress(params.userId, jobId, 'processing', 50, 'Uploading to cloud storage...');
      
      // Upload to Backblaze B2
      const uploadResult = await this.backblazeService.uploadFile(
        downloadResult.filePath,
        downloadResult.filename,
        params.userId
      );
      
      this.emitProgress(params.userId, jobId, 'processing', 70, 'Generating AI metadata...');
      
      // Generate AI metadata
      const aiMetadata = await this.geminiService.generateMetadataFromFile(downloadResult.filePath);
      
      this.emitProgress(params.userId, jobId, 'processing', 90, 'Finalizing...');
      
      // Create media item
      const mediaItemData: any = {
        id: uuidv4(),
        userId: params.userId,
        originalUrl: params.url,
        platform: params.platform,
        title: downloadResult.title || 'Untitled',
        description: downloadResult.description,
        metadata: {
          ...downloadResult.metadata,
          aiGenerated: aiMetadata,
        },
        files: [{
          id: uuidv4(),
          filename: uploadResult.filename,
          originalName: downloadResult.filename,
          mimeType: downloadResult.mimeType,
          size: downloadResult.size,
          b2FileId: uploadResult.fileId,
          b2FileName: uploadResult.fileName,
          downloadUrl: uploadResult.downloadUrl,
          isOriginal: true,
          format: downloadResult.format,
        }],
        visibility: params.visibility,
        tags: params.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadStatus: 'completed',
      };

      // Only add publicId if visibility is public
      if (params.visibility === 'public') {
        mediaItemData.publicId = uuidv4();
      }

      const mediaItem = mediaItemData as MediaItem;
      
      // Clean the object to remove any undefined values
      const cleanedMediaItem = this.cleanObject(mediaItem);
      
      await this.db.collection('media').doc(mediaItem.id).set(cleanedMediaItem);
      
      // Update job with completion
      await this.updateJobStatus(jobId, 'completed', 100, mediaItem.id);
      this.emitProgress(params.userId, jobId, 'completed', 100, 'Download completed successfully!', mediaItem);
      
      // Clean up temporary file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      
      return { jobId, mediaItem };
      
    } catch (error) {
      console.error('Download processing error:', error);
      const errorMessage = (error as Error).message;
      
      // Update job status in database
      await this.updateJobStatus(jobId, 'failed', 0, undefined, errorMessage);
      
      // Emit detailed error to user
      this.emitProgress(params.userId, jobId, 'failed', 0, errorMessage);
      
      return { jobId };
    }
  }

  private emitProgress(
    userId: string, 
    jobId: string, 
    status: DownloadStatus, 
    progress: number, 
    message: string,
    mediaItem?: MediaItem
  ): void {
    const progressData = {
      jobId,
      status,
      progress,
      message,
      mediaItem,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[PROGRESS] Emitting to user:${userId}:`, progressData);
    
    if (this.io) {
      this.io.to(`user:${userId}`).emit('download-progress', progressData);
      console.log(`[PROGRESS] Emitted successfully`);
    } else {
      console.log(`[ERROR] Socket.IO instance not available`);
    }
  }

  private async downloadFromPlatform(
    url: string, 
    platform: Platform,
    onProgress?: (progress: number, message: string) => void
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
      case 'youtube':
        return this.downloadFromYouTube(url, onProgress);
      case 'twitter':
        return this.downloadFromTwitter(url, onProgress);
      case 'soundcloud':
        return this.downloadFromSoundCloud(url, onProgress);
      default:
        throw new Error(`Platform ${platform} not yet implemented`);
    }
  }

  private async downloadFromYouTube(url: string, onProgress?: (progress: number, message: string) => void): Promise<any> {
    try {
      onProgress?.(0, 'Fetching video info...');
      
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Use direct yt-dlp call instead of youtube-dl-exec
      const timestamp = Date.now();
      const filename = `youtube_${timestamp}`;
      const outputTemplate = path.join(uploadDir, `${filename}.%(ext)s`);
      
      onProgress?.(25, 'Starting download...');
      
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
              onProgress?.(25 + (downloadProgress * 0.5), `Downloading... ${downloadProgress.toFixed(1)}%`);
            }
          }
        });
        
        ytdlpProcess.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          console.log('[yt-dlp stderr]:', output.trim());
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
      
      onProgress?.(80, 'Processing downloaded file...');
      
      // Add a small delay to ensure file system operations complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
          
          onProgress?.(100, 'YouTube download completed');
          
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
      
      onProgress?.(100, 'YouTube download completed');
      
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

  private async downloadFromTwitter(url: string, onProgress?: (progress: number, message: string) => void): Promise<any> {
    try {
      onProgress?.(10, 'Fetching Twitter media...');
      
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const filename = `twitter_${Date.now()}.%(ext)s`;
      const outputPath = path.join(uploadDir, filename);
      
      onProgress?.(25, 'Downloading media...');
      
      // Use youtube-dl-exec to download Twitter/X content
      const result = await youtubeDl(url, {
        output: outputPath,
        format: 'best',
        writeInfoJson: true,
      });
      
      onProgress?.(80, 'Processing downloaded file...');
      
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
            title: info.title || info.description,
            description: info.description,
            originalAuthor: info.uploader || info.channel,
            duration: info.duration,
            publishedAt: info.upload_date ? new Date(info.upload_date) : undefined,
          };
          
          // Clean up info file
          fs.unlinkSync(path.join(uploadDir, infoFile));
        } catch (e) {
          console.log('Could not parse info JSON');
        }
      }
      
      onProgress?.(100, 'Twitter download completed');
      
      return {
        filePath: actualFilePath,
        filename: downloadedFile,
        title: metadata.title || 'Twitter Media',
        description: metadata.description,
        metadata,
        mimeType: downloadedFile.includes('.mp4') ? 'video/mp4' : 'image/jpeg',
        size: stats.size,
        format: path.extname(downloadedFile).slice(1),
      };
    } catch (error) {
      throw new Error(`Twitter download failed: ${(error as Error).message}`);
    }
  }

  private async downloadFromSoundCloud(url: string, onProgress?: (progress: number, message: string) => void): Promise<any> {
    try {
      onProgress?.(10, 'Fetching SoundCloud track info...');
      
      // Add timeout for getInfo
      const getInfoPromise = scdl.getInfo(url);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SoundCloud info fetch timeout')), 30000)
      );
      
      const info = await Promise.race([getInfoPromise, timeoutPromise]) as any;
      
      if (!info || !info.id || !info.streamable) {
        throw new Error('Track not found or not streamable');
      }
      
      onProgress?.(25, 'Starting audio download...');
      
      const filename = `soundcloud_${info.id}.mp3`;
      const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);
      
      // Ensure upload directory exists
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      onProgress?.(30, 'Connecting to SoundCloud...');
      
      // Add timeout for download
      const downloadPromise = scdl.download(url);
      const downloadTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SoundCloud download timeout')), 60000)
      );
      
      const stream = await Promise.race([downloadPromise, downloadTimeoutPromise]) as any;
      const writeStream = fs.createWriteStream(filePath);
      
      return new Promise((resolve, reject) => {
        let downloadedSize = 0;
        let lastProgressTime = Date.now();
        let progressTimeout: NodeJS.Timeout;
        
        // Progress timeout detection (if no progress for 30 seconds, fail)
        const resetProgressTimeout = () => {
          if (progressTimeout) clearTimeout(progressTimeout);
          progressTimeout = setTimeout(() => {
            reject(new Error('Download stalled - no progress for 30 seconds'));
          }, 30000);
        };
        
        resetProgressTimeout();
        
        stream.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const now = Date.now();
          
          // Only update progress every 500ms to avoid spam
          if (now - lastProgressTime > 500) {
            const progressPercent = Math.min(95, 30 + (downloadedSize / (1024 * 1024)) * 2); // Rough estimate
            onProgress?.(progressPercent, `Downloading audio... ${(downloadedSize / 1024 / 1024).toFixed(1)}MB`);
            lastProgressTime = now;
            resetProgressTimeout();
          }
        });
        
        stream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          if (progressTimeout) clearTimeout(progressTimeout);
          onProgress?.(100, 'SoundCloud download completed');
          
          try {
            const stats = fs.statSync(filePath);
            
            if (stats.size < 1024) { // Less than 1KB suggests an error
              throw new Error('Downloaded file is too small, download may have failed');
            }
            
            resolve({
              filePath,
              filename,
              title: info.title || 'Untitled Track',
              description: info.description || '',
              metadata: {
                duration: Math.floor(info.duration / 1000) || 0, // Convert from ms to seconds
                size: stats.size,
                format: 'mp3',
                originalAuthor: info.user?.username || 'Unknown Artist',
                originalTitle: info.title || 'Untitled Track',
                originalDescription: info.description || '',
                publishedAt: info.created_at ? new Date(info.created_at) : new Date(),
                genre: info.genre || 'Unknown',
                playbackCount: info.playback_count || 0,
                thumbnailUrl: info.artwork_url || info.user?.avatar_url,
                artworkUrl: info.artwork_url,
                waveformUrl: info.waveform_url,
                isStreamable: info.streamable,
                likesCount: info.likes_count || 0,
                repostsCount: info.reposts_count || 0,
              },
              mimeType: 'audio/mpeg',
              size: stats.size,
              format: 'mp3',
            });
          } catch (statError) {
            reject(new Error(`Failed to read downloaded file: ${statError.message}`));
          }
        });
        
        writeStream.on('error', (error) => {
          if (progressTimeout) clearTimeout(progressTimeout);
          reject(new Error(`Write error: ${error.message}`));
        });
        
        stream.on('error', (error) => {
          if (progressTimeout) clearTimeout(progressTimeout);
          reject(new Error(`Stream error: ${error.message}`));
        });
        
        // Overall timeout for the entire download process
        setTimeout(() => {
          if (progressTimeout) clearTimeout(progressTimeout);
          writeStream.destroy();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          reject(new Error('Download timeout - process took too long'));
        }, 300000); // 5 minutes total timeout
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('SoundCloud download error:', errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('timeout')) {
        throw new Error('SoundCloud download timed out. Please try again later.');
      } else if (errorMessage.includes('not found')) {
        throw new Error('SoundCloud track not found. Please check the URL.');
      } else if (errorMessage.includes('streamable')) {
        throw new Error('This SoundCloud track is not available for download.');
      } else if (errorMessage.includes('private')) {
        throw new Error('This SoundCloud track is private and cannot be downloaded.');
      } else {
        throw new Error(`SoundCloud download failed: ${errorMessage}`);
      }
    }
  }

  async createDownloadJob(params: {
    userId: string;
    url: string;
    platform: Platform;
    visibility: 'private' | 'public';
    tags: string[];
  }): Promise<string> {
    const jobId = uuidv4();
    
    const job: DownloadJob = {
      id: jobId,
      userId: params.userId,
      url: params.url,
      platform: params.platform,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
    };
    
    await this.db.collection('downloadJobs').doc(jobId).set(job);
    
    // Start download process asynchronously
    this.processDownload(jobId, params);
    
    return jobId;
  }

  private async processDownload(jobId: string, params: {
    userId: string;
    url: string;
    platform: Platform;
    visibility: 'private' | 'public';
    tags: string[];
  }): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'downloading', 10);
      
      // Download media based on platform
      const downloadResult = await this.downloadFromPlatform(params.url, params.platform);
      
      await this.updateJobStatus(jobId, 'processing', 50);
      
      // Upload to Backblaze B2
      const uploadResult = await this.backblazeService.uploadFile(
        downloadResult.filePath,
        downloadResult.filename,
        params.userId
      );
      
      await this.updateJobStatus(jobId, 'processing', 70);
      
      // Generate AI metadata
      const aiMetadata = await this.geminiService.generateMetadataFromFile(downloadResult.filePath);
      
      await this.updateJobStatus(jobId, 'processing', 90);
      
      // Create media item
      const mediaItemData: any = {
        id: uuidv4(),
        userId: params.userId,
        originalUrl: params.url,
        platform: params.platform,
        title: downloadResult.title || 'Untitled',
        description: downloadResult.description,
        metadata: {
          ...downloadResult.metadata,
          aiGenerated: aiMetadata,
        },
        files: [{
          id: uuidv4(),
          filename: uploadResult.filename,
          originalName: downloadResult.filename,
          mimeType: downloadResult.mimeType,
          size: downloadResult.size,
          b2FileId: uploadResult.fileId,
          b2FileName: uploadResult.fileName,
          downloadUrl: uploadResult.downloadUrl,
          isOriginal: true,
          format: downloadResult.format,
        }],
        visibility: params.visibility,
        tags: params.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadStatus: 'completed',
      };

      // Only add publicId if visibility is public
      if (params.visibility === 'public') {
        mediaItemData.publicId = uuidv4();
      }

      const mediaItem = mediaItemData as MediaItem;
      
      // Clean the object to remove any undefined values
      const cleanedMediaItem = this.cleanObject(mediaItem);
      
      await this.db.collection('media').doc(mediaItem.id).set(cleanedMediaItem);
      
      // Update job with completion
      await this.updateJobStatus(jobId, 'completed', 100, mediaItem.id);
      
      // Clean up temporary file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      
    } catch (error) {
      console.error('Download processing error:', error);
      await this.updateJobStatus(jobId, 'failed', 0, undefined, (error as Error).message);
    }
  }

  async processDirectUpload(params: {
    file: Express.Multer.File;
    userId: string;
    title: string;
    description?: string;
    visibility: 'private' | 'public';
    tags: string[];
  }): Promise<MediaItem> {
    try {
      // Upload to Backblaze B2
      const uploadResult = await this.backblazeService.uploadFile(
        params.file.path,
        params.file.originalname,
        params.userId
      );
      
      // Generate AI metadata
      const aiMetadata = await this.geminiService.generateMetadataFromFile(params.file.path);
      
      // Create media item
      const mediaItemData: any = {
        id: uuidv4(),
        userId: params.userId,
        originalUrl: '',
        platform: 'direct',
        title: params.title,
        description: params.description,
        metadata: {
          size: params.file.size,
          format: path.extname(params.file.originalname).slice(1),
          aiGenerated: aiMetadata,
        },
        files: [{
          id: uuidv4(),
          filename: uploadResult.filename,
          originalName: params.file.originalname,
          mimeType: params.file.mimetype,
          size: params.file.size,
          b2FileId: uploadResult.fileId,
          b2FileName: uploadResult.fileName,
          downloadUrl: uploadResult.downloadUrl,
          isOriginal: true,
          format: path.extname(params.file.originalname).slice(1),
        }],
        visibility: params.visibility,
        tags: params.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadStatus: 'completed',
      };

      // Only add publicId if visibility is public
      if (params.visibility === 'public') {
        mediaItemData.publicId = uuidv4();
      }

      const mediaItem = mediaItemData as MediaItem;
      
      // Clean the object to remove any undefined values
      const cleanedMediaItem = this.cleanObject(mediaItem);
      
      await this.db.collection('media').doc(mediaItem.id).set(cleanedMediaItem);
      
      // Clean up temporary file
      if (fs.existsSync(params.file.path)) {
        fs.unlinkSync(params.file.path);
      }
      
      return mediaItem;
    } catch (error) {
      throw createError(`Upload processing failed: ${(error as Error).message}`, 500);
    }
  }

  private async updateJobStatus(
    jobId: string, 
    status: DownloadStatus, 
    progress: number, 
    mediaItemId?: string, 
    error?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      progress,
      updatedAt: new Date(),
    };
    
    if (mediaItemId) updateData.mediaItemId = mediaItemId;
    if (error) updateData.error = error;
    
    await this.db.collection('downloadJobs').doc(jobId).update(updateData);
  }

  async getJobStatus(jobId: string, userId: string): Promise<DownloadJob | null> {
    const jobDoc = await this.db.collection('downloadJobs').doc(jobId).get();
    
    if (!jobDoc.exists) {
      return null;
    }
    
    const job = jobDoc.data() as DownloadJob;
    
    // Ensure user owns this job
    if (job.userId !== userId) {
      throw createError('Unauthorized access to job', 403);
    }
    
    return job;
  }

  async getMediaItem(id: string, userId: string): Promise<MediaItem | null> {
    const mediaDoc = await this.db.collection('media').doc(id).get();
    
    if (!mediaDoc.exists) {
      return null;
    }
    
    const media = mediaDoc.data() as MediaItem;
    
    // Ensure user owns this media item
    if (media.userId !== userId) {
      throw createError('Unauthorized access to media item', 403);
    }
    
    return { ...media, id: mediaDoc.id };
  }

  async updateMediaItem(id: string, userId: string, updates: {
    title?: string;
    description?: string;
    visibility?: 'private' | 'public';
    tags?: string[];
  }): Promise<MediaItem> {
    const mediaDoc = await this.db.collection('media').doc(id).get();
    
    if (!mediaDoc.exists) {
      throw createError('Media item not found', 404);
    }
    
    const media = mediaDoc.data() as MediaItem;
    
    if (media.userId !== userId) {
      throw createError('Unauthorized access to media item', 403);
    }
    
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    
    // Generate public ID if visibility changed to public
    if (updates.visibility === 'public' && !media.publicId) {
      updateData.publicId = uuidv4();
    }
    
    await this.db.collection('media').doc(id).update(updateData);
    
    const updatedDoc = await this.db.collection('media').doc(id).get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as MediaItem;
  }

  async deleteMediaItem(id: string, userId: string): Promise<void> {
    const mediaDoc = await this.db.collection('media').doc(id).get();
    
    if (!mediaDoc.exists) {
      throw createError('Media item not found', 404);
    }
    
    const media = mediaDoc.data() as MediaItem;
    
    if (media.userId !== userId) {
      throw createError('Unauthorized access to media item', 403);
    }
    
    // Delete files from Backblaze B2
    for (const file of media.files) {
      await this.backblazeService.deleteFile(file.b2FileId);
    }
    
    // Delete from Firestore
    await this.db.collection('media').doc(id).delete();
  }
} 