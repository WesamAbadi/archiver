import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { authenticateToken, AuthenticatedRequest, optionalAuth } from '../middleware/auth';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { MediaDownloadService } from '../services/MediaDownloadService';
import { GeminiService } from '../services/GeminiService';
import { BackblazeService } from '../services/BackblazeService';
import { CaptionService } from '../services/CaptionService';
import { AnalyticsService } from '../services/AnalyticsService';
import { detectPlatform, validateUrl } from '../utils/urlUtils';
import { Visibility, Platform } from '../types';
import prisma from '../lib/database';
import { uploadCancellationService } from '../services/UploadCancellationService';

const router: Router = Router();
const upload = multer({ 
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      // Preserve the original file extension
      const ext = path.extname(file.originalname);
      const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
      cb(null, filename);
    }
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '100000000') }
});

// Helper function to ensure user exists and get their database ID
async function ensureUserExists(userUid: string, email?: string, displayName?: string): Promise<string> {
  let user = await prisma.user.findUnique({
    where: { uid: userUid }
  });

  if (!user) {
    // If user doesn't exist, create them
    user = await prisma.user.create({
      data: {
        uid: userUid,
        email: email || `${userUid}@temp.example.com`,
        displayName: displayName || 'User'
      }
    });
    console.log('Created new user in database:', user.id);
  }

  return user.id;
}

const geminiService = new GeminiService();
const backblazeService = new BackblazeService();
const captionService = new CaptionService();
const analyticsService = new AnalyticsService();

// Get public media items
router.get('/public', asyncHandler(async (req, res) => {
  const { 
    filter = 'all', 
    page = '1', 
    limit = '20',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    tag
  } = req.query;
  
  const where: any = {
    visibility: 'PUBLIC'
  };
  
  // Handle tag filtering
  if (tag) {
    where.tags = {
      has: tag
    };
  } else if (filter !== 'all') {
    where.tags = {
      has: filter
    };
  }

  // Validate sort parameters
  const allowedSortFields = ['createdAt', 'viewCount', 'likeCount'];
  const actualSortBy = allowedSortFields.includes(sortBy as string) ? sortBy : 'createdAt';
  const actualSortOrder = ['asc', 'desc'].includes(sortOrder as string) ? sortOrder : 'desc';
  
  const orderBy: any = {};
  orderBy[actualSortBy as string] = actualSortOrder as 'asc' | 'desc';
  
  const mediaItems = await prisma.mediaItem.findMany({
    where,
    include: {
      user: {
        select: {
          displayName: true,
          photoURL: true
        }
      },
      files: true
    },
    orderBy,
    skip: (parseInt(page as string) - 1) * parseInt(limit as string),
    take: parseInt(limit as string)
  });
  
  // Serialize BigInt values
  const serializedItems = mediaItems.map(item => ({
    ...item,
    size: item.size ? item.size.toString() : null,
    files: item.files.map(file => ({
      ...file,
      size: file.size ? file.size.toString() : null
    }))
  }));
  
  res.json({ success: true, data: serializedItems });
}));

// Get user's media items
router.get('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaDownloadService = new MediaDownloadService();
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  const mediaItems = await prisma.mediaItem.findMany({
    where: { userId: dbUserId },
    include: {
      files: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  // Serialize BigInt values
  const serializedItems = mediaItems.map(item => ({
    ...item,
    size: item.size ? item.size.toString() : null,
    files: item.files.map(file => ({
      ...file,
      size: file.size ? file.size.toString() : null
    }))
  }));
  
  res.json({ success: true, data: serializedItems });
}));

// Submit a URL for immediate download and archiving
router.post('/submit', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { url, visibility = 'PRIVATE', tags = [] } = req.body;
  
  if (!url || !validateUrl(url)) {
    throw createError('Valid URL is required', 400);
  }
  
  const platform = detectPlatform(url);
  if (!platform) {
    throw createError('Unsupported platform', 400);
  }
  
  // Get Socket.IO instance from app
  const io = req.app.get('io');
  const mediaDownloadService = new MediaDownloadService(io);
  
  try {
    // Start immediate download processing with real-time progress
    const result = await mediaDownloadService.processDownloadImmediate({
      userId: req.user.uid,
      url,
      platform: platform.toUpperCase() as Platform,
      visibility: visibility.toUpperCase() as Visibility,
      tags,
    });
    
    res.json({ 
      success: true, 
      data: {
        jobId: result.jobId,
        mediaItem: result.mediaItem
      },
      message: 'Download completed successfully!'
    });
  } catch (error) {
    console.error('Download error:', error);
    throw createError(`Download failed: ${(error as Error).message}`, 500);
  }
}));

// Upload media file directly
router.post('/upload', authenticateToken, upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    throw createError('No file uploaded', 400);
  }
  
  const { title, description, visibility = 'PRIVATE', tags = [] } = req.body;
  
  // Get Socket.IO instance from app
  const io = req.app.get('io');
  const mediaDownloadService = new MediaDownloadService(io);
  
  // Create a unique job ID for this upload
  const jobId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Emit initial progress
  io.to(`user:${req.user.uid}`).emit('upload-progress', {
    jobId,
    stage: 'upload',
    progress: 100,
    message: 'File uploaded to server',
    details: `Processing ${req.file.originalname}`
  });
  
  // Process and upload file with progress tracking
  const result = await mediaDownloadService.processDirectUpload({
    file: req.file,
    userId: req.user.uid,
    title,
    description,
    visibility: visibility.toUpperCase() as Visibility,
    tags: JSON.parse(tags || '[]'),
    jobId, // Pass the job ID for tracking
  });
  
  res.json({ 
    success: true, 
    data: {
      jobId: result.jobId || jobId,
      mediaItem: result.mediaItem
    },
    message: 'Upload completed successfully!'
  });
}));

// Batch submit URLs for download and archiving
router.post('/batch-submit', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { urls, visibility = 'PRIVATE', tags = [] } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw createError('Array of URLs is required', 400);
  }
  
  // Validate all URLs
  const validUrls = urls.filter(url => url && validateUrl(url));
  if (validUrls.length === 0) {
    throw createError('No valid URLs provided', 400);
  }
  
  // Check platforms (for now, assume all are same platform - could be enhanced)
  const platform = detectPlatform(validUrls[0]);
  if (!platform) {
    throw createError('Unsupported platform', 400);
  }
  
  // Get Socket.IO instance from app
  const io = req.app.get('io');
  const mediaDownloadService = new MediaDownloadService(io);
  
  try {
    // Start batch download processing with real-time progress
    const result = await mediaDownloadService.processBatchDownload({
      userId: req.user.uid,
      urls: validUrls,
      platform: platform.toUpperCase() as Platform,
      visibility: visibility.toUpperCase() as Visibility,
      tags,
    });
    
    res.json({ 
      success: true, 
      data: {
        jobId: result.jobId,
        mediaItems: result.mediaItems,
        processedCount: result.mediaItems.length,
        totalCount: validUrls.length
      },
      message: `Batch download completed! Processed ${result.mediaItems.length}/${validUrls.length} URLs successfully.`
    });
  } catch (error) {
    console.error('Batch download error:', error);
    throw createError(`Batch download failed: ${(error as Error).message}`, 500);
  }
}));

// Batch upload multiple files
router.post('/batch-upload', authenticateToken, upload.array('files', 10), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    throw createError('No files uploaded', 400);
  }
  
  const { description, visibility = 'PRIVATE', tags = [] } = req.body;
  
  // Get Socket.IO instance from app
  const io = req.app.get('io');
  const mediaDownloadService = new MediaDownloadService(io);
  
  // Create a unique job ID for this batch upload
  const jobId = `batch-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Emit initial progress
  io.to(`user:${req.user.uid}`).emit('upload-progress', {
    jobId,
    stage: 'upload',
    progress: 0,
    message: `Starting batch upload of ${files.length} files`,
    details: `Processing ${files.length} files`
  });
  
  try {
    // Process and upload files with progress tracking
    const result = await mediaDownloadService.processBatchDirectUpload({
      files,
      userId: req.user.uid,
      description,
      visibility: visibility.toUpperCase() as Visibility,
      tags: JSON.parse(tags || '[]'),
      jobId, // Pass the job ID for tracking
    });
    
    res.json({ 
      success: true, 
      data: {
        jobId: result.jobId || jobId,
        mediaItems: result.mediaItems,
        processedCount: result.mediaItems.length,
        totalCount: files.length
      },
      message: `Batch upload completed! Processed ${result.mediaItems.length}/${files.length} files successfully.`
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    throw createError(`Batch upload failed: ${(error as Error).message}`, 500);
  }
}));

// Cancel an ongoing upload
router.post('/cancel', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { jobId } = req.body;
  if (!jobId) {
    throw createError('Job ID is required to cancel an upload', 400);
  }

  console.log(`[UPLOAD CANCEL] User ${req.user.uid} requesting cancellation of job: ${jobId}`);

  try {
    // Mark the job for cancellation
    uploadCancellationService.cancel(jobId);
    
    // Get Socket.IO instance to notify user of cancellation
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.uid}`).emit('upload-progress', {
        jobId,
        stage: 'cancelled',
        progress: 100,
        message: 'Upload cancelled by user',
        details: 'Cleaning up files and stopping processes...',
        error: true
      });
    }
    
    console.log(`[UPLOAD CANCEL] Successfully marked job ${jobId} for cancellation`);
    
    res.json({ 
      success: true, 
      message: `Upload ${jobId} marked for cancellation. Cleanup is in progress.`,
      data: { jobId, status: 'cancelling' }
    });
  } catch (error) {
    console.error(`[UPLOAD CANCEL] Failed to cancel job ${jobId}:`, error);
    
    // Still respond with success since we want the frontend to stop trying
    res.json({ 
      success: true, 
      message: `Cancellation request received for ${jobId}. May already be complete.`,
      data: { jobId, status: 'unknown' }
    });
  }
}));

// Get media item by ID
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaDownloadService = new MediaDownloadService();
  const mediaItem = await mediaDownloadService.getMediaItem(req.params.id, req.user.uid);
  res.json({ success: true, data: mediaItem });
}));

// Update media item
router.patch('/:id', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { title, description, visibility } = req.body;
  
  const mediaDownloadService = new MediaDownloadService();
  const updatedItem = await mediaDownloadService.updateMediaItem(req.params.id, req.user.uid, {
    title,
    description,
    visibility: visibility ? visibility.toUpperCase() as Visibility : undefined,
  });
  
  res.json({ success: true, data: updatedItem });
}));

// Delete media item
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaDownloadService = new MediaDownloadService();
  await mediaDownloadService.deleteMediaItem(req.params.id, req.user.uid);
  res.json({ success: true, message: 'Media item deleted successfully' });
}));

// Generate AI metadata for media item
router.post('/:id/generate-metadata', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const metadata = await geminiService.generateMetadata(req.params.id, req.user.uid);
  res.json({ success: true, data: metadata });
}));

// Fix download URLs for existing media items
router.post('/fix-urls', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Get all media items for the user with their files
  const mediaItems = await prisma.mediaItem.findMany({
    where: {
      userId: dbUserId,
    },
    include: {
      files: true,
    },
  });
  
  let fixedCount = 0;
  
  for (const mediaItem of mediaItems) {
    if (mediaItem.files && mediaItem.files.length > 0) {
      for (const file of mediaItem.files) {
        if (file.b2FileName) {
          // Generate new correct URL (now using CDN if CDN_URL env var is set)
          const newDownloadUrl = await backblazeService.getDownloadUrl(file.b2FileName);
          
          // Update the file record
          await prisma.mediaFile.update({
            where: { id: file.id },
            data: { downloadUrl: newDownloadUrl },
          });
        }
      }
      
      fixedCount++;
    }
  }
  
  res.json({ 
    success: true, 
    message: `Fixed download URLs for ${fixedCount} media items${process.env.CDN_URL ? ' (using CDN)' : ' (using direct B2 URLs)'}`
  });
}));

// Test CDN URL generation
router.get('/test-cdn', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const testFileName = `users/${req.user.uid}/test-file.mp3`;
  const generatedUrl = await backblazeService.getDownloadUrl(testFileName);
  
  res.json({
    success: true,
    data: {
      testFileName,
      generatedUrl,
      usingCDN: !!process.env.CDN_URL,
      cdnDomain: process.env.CDN_URL || null
    }
  });
}));

// Get captions for media item
router.get('/:id/captions', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const captions = await captionService.getCaptions(req.params.id);
  res.json({ success: true, data: captions });
}));

// Generate captions for media item
router.post('/:id/captions/generate', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Get Socket.IO instance from app
  const io = req.app.get('io');
  const captionServiceWithIo = new CaptionService(io);
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  const mediaItem = await prisma.mediaItem.findFirst({
    where: { id: req.params.id, userId: dbUserId },
    include: { files: true }
  });
  
  if (!mediaItem || !mediaItem.files[0]) {
    throw createError('Media item not found', 404);
  }
  
  // Download the file temporarily for caption generation
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `caption_${Date.now()}_${mediaItem.files[0].filename}`);
  
  try {
    // Download file from B2
    const response = await axios({
      method: 'GET',
      url: mediaItem.files[0].downloadUrl,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', (err) => reject(err));
    });
    
    // Generate captions using local file with progress tracking
    const jobId = `caption-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const caption = await captionServiceWithIo.generateCaptions(req.params.id, tempFilePath, req.user.uid, jobId);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    res.json({ success: true, data: caption });
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    throw error;
  }
}));

// Update caption segments
router.put('/:id/captions/:captionId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { segments } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the caption belongs to a media item owned by this user
  const caption = await prisma.caption.findFirst({
    where: { 
      id: req.params.captionId,
      mediaItem: { userId: dbUserId }
    },
    include: { segments: true }
  });
  
  if (!caption) {
    throw createError('Caption not found', 404);
  }
  
  // Delete existing segments
  await prisma.captionSegment.deleteMany({
    where: { captionId: req.params.captionId }
  });
  
  // Create new segments
  const newSegments = await Promise.all(
    segments.map((segment: any) => 
      prisma.captionSegment.create({
        data: {
          captionId: req.params.captionId,
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
          confidence: segment.confidence || 1.0
        }
      })
    )
  );
  
  const updatedCaption = await prisma.caption.findUnique({
    where: { id: req.params.captionId },
    include: { segments: { orderBy: { startTime: 'asc' } } }
  });
  
  res.json({ success: true, data: updatedCaption });
}));

// Create new caption for media item
router.post('/:id/captions', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { language = 'en', segments = [] } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the media item belongs to this user
  const mediaItem = await prisma.mediaItem.findFirst({
    where: { id: req.params.id, userId: dbUserId }
  });
  
  if (!mediaItem) {
    throw createError('Media item not found', 404);
  }
  
  const caption = await prisma.caption.create({
    data: {
      mediaItemId: req.params.id,
      language,
      isAutoGenerated: false,
      segments: {
        create: segments.map((segment: any) => ({
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
          confidence: segment.confidence || 1.0
        }))
      }
    },
    include: { segments: { orderBy: { startTime: 'asc' } } }
  });
  
  res.json({ success: true, data: caption });
}));

// Delete caption
router.delete('/:id/captions/:captionId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the caption belongs to a media item owned by this user
  const caption = await prisma.caption.findFirst({
    where: { 
      id: req.params.captionId,
      mediaItem: { userId: dbUserId }
    }
  });
  
  if (!caption) {
    throw createError('Caption not found', 404);
  }
  
  await prisma.caption.delete({
    where: { id: req.params.captionId }
  });
  
  res.json({ success: true, message: 'Caption deleted successfully' });
}));

// Update individual caption segment
router.put('/:id/captions/:captionId/segments/:segmentId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { startTime, endTime, text, confidence } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the segment belongs to a caption of a media item owned by this user
  const segment = await prisma.captionSegment.findFirst({
    where: { 
      id: req.params.segmentId,
      caption: {
        mediaItem: { userId: dbUserId }
      }
    }
  });
  
  if (!segment) {
    throw createError('Caption segment not found', 404);
  }
  
  const updatedSegment = await prisma.captionSegment.update({
    where: { id: req.params.segmentId },
    data: {
      startTime: startTime !== undefined ? startTime : segment.startTime,
      endTime: endTime !== undefined ? endTime : segment.endTime,
      text: text !== undefined ? text : segment.text,
      confidence: confidence !== undefined ? confidence : segment.confidence
    }
  });
  
  res.json({ success: true, data: updatedSegment });
}));

// Delete individual caption segment
router.delete('/:id/captions/:captionId/segments/:segmentId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the segment belongs to a caption of a media item owned by this user
  const segment = await prisma.captionSegment.findFirst({
    where: { 
      id: req.params.segmentId,
      caption: {
        mediaItem: { userId: dbUserId }
      }
    }
  });
  
  if (!segment) {
    throw createError('Caption segment not found', 404);
  }
  
  await prisma.captionSegment.delete({
    where: { id: req.params.segmentId }
  });
  
  res.json({ success: true, message: 'Caption segment deleted successfully' });
}));

// Add new caption segment
router.post('/:id/captions/:captionId/segments', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { startTime, endTime, text, confidence = 1.0 } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  // Verify the caption belongs to a media item owned by this user
  const caption = await prisma.caption.findFirst({
    where: { 
      id: req.params.captionId,
      mediaItem: { userId: dbUserId }
    }
  });
  
  if (!caption) {
    throw createError('Caption not found', 404);
  }
  
  const newSegment = await prisma.captionSegment.create({
    data: {
      captionId: req.params.captionId,
      startTime,
      endTime,
      text,
      confidence
    }
  });
  
  res.json({ success: true, data: newSegment });
}));

// Track view
router.post('/:id/views', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { watchDuration } = req.body;
  await analyticsService.trackView(req.params.id, req.user?.uid, watchDuration);
  res.json({ success: true });
}));

// Get view statistics
router.get('/:id/stats', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const stats = await analyticsService.getViewStats(req.params.id);
  res.json({ success: true, data: stats });
}));

// Toggle like
router.post('/:id/like', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { liked } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  if (liked) {
    await prisma.like.create({
      data: {
        userId: dbUserId,
        mediaItemId: req.params.id
      }
    });
  } else {
    await prisma.like.deleteMany({
      where: {
        userId: dbUserId,
        mediaItemId: req.params.id
      }
    });
  }
  
  await analyticsService.updateEngagementCounts(req.params.id);
  res.json({ success: true });
}));

// Add comment
router.post('/:id/comments', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { content } = req.body;
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid, req.user.email, req.user.displayName);
  
  const comment = await prisma.comment.create({
    data: {
      userId: dbUserId,
      mediaItemId: req.params.id,
      content
    },
    include: {
      user: true
    }
  });
  
  await analyticsService.updateEngagementCounts(req.params.id);
  res.json({ success: true, data: comment });
}));

// Get comments
router.get('/:id/comments', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const comments = await prisma.comment.findMany({
    where: { mediaItemId: req.params.id },
    include: { user: true },
    orderBy: { createdAt: 'desc' }
  });
  
  res.json({ success: true, data: comments });
}));

// Get popular tags (public endpoint)
router.get('/popular-tags', optionalAuth, asyncHandler(async (req, res) => {
  const { random = '3' } = req.query;
  
  // Get all public media items' tags
  const mediaItems = await prisma.mediaItem.findMany({
    where: {
      visibility: 'PUBLIC',
      tags: { isEmpty: false }
    },
    select: {
      tags: true
    }
  });
  
  // Count tag occurrences
  const tagCounts = mediaItems.reduce((acc, item) => {
    item.tags.forEach(tag => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);
  
  // Convert to array and sort by count
  const sortedTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50) // Get top 50 most used tags
    .map(([tag, count]) => ({ tag, count }));
  
  // If random parameter is provided, return random tags from top 50
  if (random) {
    const numRandom = Math.min(parseInt(random as string), sortedTags.length);
    const shuffled = [...sortedTags].sort(() => Math.random() - 0.5);
    res.json({ success: true, data: shuffled.slice(0, numRandom) });
    return;
  }
  
  res.json({ success: true, data: sortedTags });
}));

export default router; 