import B2 from 'backblaze-b2';
import * as fs from 'fs';
import * as path from 'path';
import { createError } from '../middleware/errorHandler';

export class BackblazeService {
  private b2: B2;
  private bucketId: string;
  private bucketName: string;

  constructor() {
    this.b2 = new B2({
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
      applicationKey: process.env.B2_APPLICATION_KEY!,
    });
    
    this.bucketId = process.env.B2_BUCKET_ID!;
    this.bucketName = process.env.B2_BUCKET_NAME!;
  }

  async initialize(): Promise<void> {
    try {
      await this.b2.authorize();
    } catch (error) {
      throw createError(`Failed to authorize with Backblaze B2: ${(error as Error).message}`, 500);
    }
  }

  async uploadFile(filePath: string, originalName: string, userId: string): Promise<{
    fileId: string;
    fileName: string;
    filename: string;
    downloadUrl: string;
  }> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        await this.initialize();
        
        // Create user-specific path
        const fileName = `users/${userId}/${Date.now()}-${originalName}`;
        
        console.log(`📤 Starting B2 upload: ${originalName} (Attempt ${retryCount + 1}/${maxRetries})`);
        console.log(`📁 Upload path: ${fileName}`);
        
        // Get upload URL with timeout
        const uploadUrlResponse = await Promise.race([
          this.b2.getUploadUrl({
            bucketId: this.bucketId,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload URL timeout')), 30000)
          )
        ]) as any;
        
        console.log(`🔗 Got upload URL from B2`);
        
        // Read file and get stats
        const fileBuffer = fs.readFileSync(filePath);
        const fileStats = fs.statSync(filePath);
        const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`📊 File size: ${fileSizeMB}MB (${fileStats.size} bytes)`);
        
        const startTime = Date.now();
        let lastProgressUpdate = 0;
        let lastProgressTime = startTime;
        let consecutiveSlowUpdates = 0;
        
        // Upload file with enhanced progress tracking and speed monitoring
        const uploadResponse = await Promise.race([
          this.b2.uploadFile({
            uploadUrl: uploadUrlResponse.data.uploadUrl,
            uploadAuthToken: uploadUrlResponse.data.authorizationToken,
            fileName: fileName,
            data: fileBuffer,
            hash: null, // Let B2 calculate the hash
            info: {
              originalName: originalName,
              uploadedBy: userId,
              uploadedAt: new Date().toISOString(),
            },
            onUploadProgress: (progress: any) => {
              if (progress && progress.loaded !== undefined && progress.total !== undefined) {
                const percentage = Math.round((progress.loaded / progress.total) * 100);
                const uploadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
                const totalMB = (progress.total / (1024 * 1024)).toFixed(2);
                const currentTime = Date.now();
                
                // Update progress every 5% or every 2 seconds
                if (percentage >= lastProgressUpdate + 5 || currentTime - lastProgressTime > 2000) {
                  const elapsedTime = (currentTime - startTime) / 1000;
                  const currentSpeedMBps = elapsedTime > 0 ? (progress.loaded / (1024 * 1024) / elapsedTime).toFixed(2) : '0';
                  const instantSpeedMBps = lastProgressTime > 0 ? 
                    ((progress.loaded - (progress.total * lastProgressUpdate / 100)) / (1024 * 1024) / ((currentTime - lastProgressTime) / 1000)).toFixed(2) : currentSpeedMBps;
                  
                  console.log(`⬆️ Uploading to B2... ${percentage}% (${uploadedMB}/${totalMB}MB) - ${currentSpeedMBps} MB/s avg, ${instantSpeedMBps} MB/s current`);
                  
                  // Monitor for speed degradation
                  const speedMBps = parseFloat(instantSpeedMBps);
                  if (speedMBps < 0.1 && percentage > 10) {
                    consecutiveSlowUpdates++;
                    if (consecutiveSlowUpdates >= 3) {
                      console.log(`🐌 Detected significant speed degradation (${speedMBps} MB/s). Upload may be stalling.`);
                    }
                  } else {
                    consecutiveSlowUpdates = 0;
                  }
                  
                  lastProgressUpdate = percentage;
                  lastProgressTime = currentTime;
                }
              }
            },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout - connection may be stalled')), 300000) // 5 minute timeout
          )
        ]) as any;
        
        const uploadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const uploadSpeedMBps = (fileStats.size / (1024 * 1024) / parseFloat(uploadTime)).toFixed(2);
        
        console.log(`✅ B2 upload completed: 100%`);
        console.log(`⚡ Upload speed: ${uploadSpeedMBps} MB/s (${uploadTime}s total)`);
        console.log(`🆔 File ID: ${uploadResponse.data.fileId}`);
        
        // Generate download URL
        console.log(`🔗 Generating download URL...`);
        const downloadUrl = await this.getDownloadUrl(fileName);
        console.log(`✅ Download URL ready: ${downloadUrl.substring(0, 50)}...`);
        
        return {
          fileId: uploadResponse.data.fileId,
          fileName: fileName,
          filename: originalName,
          downloadUrl: downloadUrl,
        };
        
      } catch (error) {
        retryCount++;
        const errorMessage = (error as Error).message;
        
        if (errorMessage.includes('timeout') || errorMessage.includes('stalled') || 
            errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT')) {
          
          if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.log(`⚠️ Upload failed due to connection issue: ${errorMessage}`);
            console.log(`🔄 Retrying upload in ${delay/1000}s... (Attempt ${retryCount + 1}/${maxRetries})`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        console.error(`❌ B2 upload failed after ${retryCount} attempts: ${errorMessage}`);
        throw createError(`Failed to upload file to B2 after ${retryCount} attempts: ${errorMessage}`, 500);
      }
    }
    
    throw createError('Upload failed after maximum retry attempts', 500);
  }

  async getDownloadUrl(fileName: string): Promise<string> {
    try {
      // Use CDN URL if available, otherwise fallback to B2 direct URL
      const cdnUrl = process.env.CDN_URL;
      
      if (cdnUrl) {
        // CDN URL format: https://lately-robust-thrush.global.ssl.fastly.net/users/...
        // fileName format: users/102678673714259272192/1750791680514-soundcloud_1750791676915.mp3
        return `https://${cdnUrl}/${fileName}`;
      }
      
      // Fallback to original B2 URL generation
      await this.initialize();
      
      console.log('Bucket ID:', this.bucketId);
      console.log('Bucket Name:', this.bucketName);
      
      // For public buckets, use the simple friendly URL format
      // Based on your example: f005 from bucket ID, let's try different approaches
      let bucketSubdomain;
      
      if (this.bucketId.includes('005')) {
        bucketSubdomain = 'f005';
      } else if (this.bucketId.length > 4) {
        // Extract numeric part and format as f+3digits
        const numericPart = this.bucketId.match(/\d+/g)?.[0];
        if (numericPart && numericPart.length >= 3) {
          bucketSubdomain = `f${numericPart.slice(-3)}`;
        } else {
          bucketSubdomain = 'f005'; // Default fallback
        }
      } else {
        bucketSubdomain = 'f005'; // Default fallback
      }
      
      const baseUrl = `https://${bucketSubdomain}.backblazeb2.com/file/${this.bucketName}/${fileName}`;
      console.log('Generated URL:', baseUrl);
      
      // For public buckets, return the direct URL without authorization
      return baseUrl;
    } catch (error) {
      console.error('Download URL generation error:', error);
      // Fallback to the working format from your example
      return `https://f005.backblazeb2.com/file/${this.bucketName}/${fileName}`;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.initialize();
      
      // Get file info first
      const fileInfo = await this.b2.getFileInfo({ fileId });
      
      // Delete the file
      await this.b2.deleteFileVersion({
        fileId: fileId,
        fileName: fileInfo.data.fileName,
      });
      
    } catch (error) {
      console.error(`Failed to delete file from B2: ${(error as Error).message}`);
      // Don't throw error for delete failures to avoid blocking other operations
    }
  }

  async listFiles(userId: string, prefix?: string): Promise<any[]> {
    try {
      await this.initialize();
      
      const userPrefix = `users/${userId}/${prefix || ''}`;
      
      const response = await this.b2.listFileNames({
        bucketId: this.bucketId,
        startFileName: '',
        delimiter: '',
        prefix: userPrefix,
        maxFileCount: 1000,
      });
      
      return response.data.files;
    } catch (error) {
      throw createError(`Failed to list files: ${(error as Error).message}`, 500);
    }
  }

  async getFileInfo(fileId: string): Promise<any> {
    try {
      await this.initialize();
      
      const response = await this.b2.getFileInfo({ fileId });
      return response.data;
    } catch (error) {
      throw createError(`Failed to get file info: ${(error as Error).message}`, 500);
    }
  }
} 