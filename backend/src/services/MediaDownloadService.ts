import ytdl from 'ytdl-core';
import youtubeDl from 'youtube-dl-exec';
import scdl from 'soundcloud-downloader';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem, DownloadJob, Platform, DownloadStatus, Visibility } from '../types';
import { BackblazeService } from './BackblazeService';
import { GeminiService } from './GeminiService';
import { createError } from '../middleware/errorHandler';
import prisma from '../lib/database';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class MediaDownloadService {
  private backblazeService = new BackblazeService();
  private geminiService = new GeminiService();
  private io?: any; // Socket.IO instance for progress updates

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
      // Emit initial progress
      this.emitProgress(params.userId, jobId, 'PENDING', 0, 'Starting download...');
      
      // Ensure user exists and get their database ID
      const dbUserId = await this.ensureUserExists(params.userId);
      
      this.emitProgress(params.userId, jobId, 'DOWNLOADING', 10, 'Initializing download...');
      
      // Download media based on platform
      const downloadResult = await this.downloadFromPlatform(params.url, params.platform, (progress, message) => {
        this.emitProgress(params.userId, jobId, 'DOWNLOADING', 10 + (progress * 0.4), message);
      });
      
      this.emitProgress(params.userId, jobId, 'PROCESSING', 50, 'Uploading to cloud storage...');
      
      // Upload to Backblaze B2
      const uploadResult = await this.backblazeService.uploadFile(
        downloadResult.filePath,
        downloadResult.filename,
        params.userId // Still use OAuth ID for file organization
      );
      
      this.emitProgress(params.userId, jobId, 'PROCESSING', 70, 'Generating AI metadata...');
      
      // Generate AI metadata
      const aiMetadata = await this.geminiService.generateMetadataFromFile(downloadResult.filePath);
      
      this.emitProgress(params.userId, jobId, 'PROCESSING', 90, 'Finalizing...');
      
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
        aiCaptions: aiMetadata?.captions,
        aiGeneratedAt: aiMetadata ? new Date() : undefined,
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
      
      // Clean up temporary file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      
      // Return serialized media item (converts BigInt to string)
      const serializedMediaItem = this.serializeMediaItem(mediaItem);
      
      // Emit completion progress
      this.emitProgress(params.userId, jobId, 'COMPLETED', 100, 'Download completed successfully!', serializedMediaItem);
      
      return { jobId, mediaItem: serializedMediaItem };
      
    } catch (error) {
      console.error('Download processing error:', error);
      
      // Emit error progress
      this.emitProgress(params.userId, jobId, 'FAILED', 0, (error as Error).message);
      
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
        return this.downloadFromSoundCloud(url, progressCallback);
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
      
      // Use soundcloud-downloader to get track info and download
      let trackProgress = 0;
      let progressTimer: NodeJS.Timeout | null = null;
      
      const startProgressTimer = () => {
        progressTimer = setTimeout(() => {
          trackProgress += 5;
          progressCallback?.(trackProgress, `Downloading... ${trackProgress}%`);
          if (trackProgress < 90) {
            startProgressTimer();
          }
        }, 1000);
      };
      
      startProgressTimer();
      
      const stream = await scdl.download(url);
      
      const filename = `soundcloud_${Date.now()}.mp3`;
      const filePath = path.join(uploadDir, filename);
      
      // Pipe the stream to a file
      const writeStream = fs.createWriteStream(filePath);
      stream.pipe(writeStream);
      
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => {
          // Clear the progress timer when download finishes
          if (progressTimer) {
            clearTimeout(progressTimer);
            progressTimer = null;
          }
          resolve();
        });
        writeStream.on('error', (error) => {
          // Clear the progress timer on error
          if (progressTimer) {
            clearTimeout(progressTimer);
            progressTimer = null;
          }
          reject(error);
        });
      });
      
      // Get track info
      let trackInfo: any = {};
      try {
        trackInfo = await scdl.getInfo(url);
      } catch (e) {
        // Silently continue if track info fails
      }
      
      const stats = fs.statSync(filePath);
      
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
      throw new Error(`SoundCloud download failed: ${(error as Error).message}`);
    }
  }

  async processDirectUpload(params: {
    file: Express.Multer.File;
    userId: string;
    title: string;
    description?: string;
    visibility: Visibility;
    tags: string[];
  }): Promise<MediaItem> {
    try {
      // Ensure user exists and get their database ID
      const dbUserId = await this.ensureUserExists(params.userId);
      
      // Upload to Backblaze B2
      const uploadResult = await this.backblazeService.uploadFile(
        params.file.path,
        params.file.originalname,
        params.userId // Still use OAuth ID for file organization
      );
      
      // Generate AI metadata
      const aiMetadata = await this.geminiService.generateMetadataFromFile(params.file.path);
      
      // Create media item
      const mediaItemData = {
        id: uuidv4(),
        userId: dbUserId, // Use database user ID, not OAuth UID
        originalUrl: 'direct-upload',
        platform: 'DIRECT' as Platform,
        title: params.title,
        description: params.description,
        visibility: params.visibility,
        tags: params.tags,
        downloadStatus: 'COMPLETED' as DownloadStatus,
        publicId: params.visibility === 'PUBLIC' ? uuidv4() : undefined,
        // File metadata
        size: BigInt(params.file.size),
        format: path.extname(params.file.originalname).slice(1),
        // AI generated
        aiSummary: aiMetadata?.summary,
        aiKeywords: aiMetadata?.keywords || [],
        aiCaptions: aiMetadata?.captions,
        aiGeneratedAt: aiMetadata ? new Date() : undefined,
      };

      const mediaItem = await prisma.mediaItem.create({
        data: mediaItemData,
        include: {
          files: true,
        },
      });

      // Create media file
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
      
      // Clean up temporary file
      if (fs.existsSync(params.file.path)) {
        fs.unlinkSync(params.file.path);
      }
      
      // Return serialized media item (converts BigInt to string)
      return this.serializeMediaItem(mediaItem);
    } catch (error) {
      // Clean up temporary file on error
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

  // Emit progress update to user via Socket.IO
  private emitProgress(
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
} 