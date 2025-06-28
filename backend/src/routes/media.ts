import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
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
  const { filter = 'all', page = '1', limit = '20' } = req.query;
  
  const where: any = {
    visibility: 'PUBLIC'
  };
  
  if (filter !== 'all') {
    where.tags = {
      has: filter
    };
  }
  
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
    orderBy: { createdAt: 'desc' },
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

// Cancel an ongoing upload
router.post('/cancel', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { jobId } = req.body;
  if (!jobId) {
    throw createError('Job ID is required to cancel an upload', 400);
  }

  uploadCancellationService.cancel(jobId);

  res.json({ success: true, message: `Upload ${jobId} marked for cancellation.` });
}));

// Get media item by ID
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaDownloadService = new MediaDownloadService();
  const mediaItem = await mediaDownloadService.getMediaItem(req.params.id, req.user.uid);
  res.json({ success: true, data: mediaItem });
}));

// Update media item
router.patch('/:id', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { title, description, visibility, tags } = req.body;
  
  const mediaDownloadService = new MediaDownloadService();
  const updatedItem = await mediaDownloadService.updateMediaItem(req.params.id, req.user.uid, {
    title,
    description,
    visibility: visibility ? visibility.toUpperCase() as Visibility : undefined,
    tags,
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

export default router; 