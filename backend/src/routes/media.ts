import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { MediaDownloadService } from '../services/MediaDownloadService';
import { GeminiService } from '../services/GeminiService';
import { BackblazeService } from '../services/BackblazeService';
import { detectPlatform, validateUrl } from '../utils/urlUtils';

const router: Router = Router();
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '100000000') }
});

const geminiService = new GeminiService();
const backblazeService = new BackblazeService();

// Submit a URL for immediate download and archiving with real-time progress
router.post('/submit', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { url, visibility = 'private', tags = [] } = req.body;
  
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
    // Start immediate download with real-time progress
    const result = await mediaDownloadService.processDownloadImmediate({
      userId: req.user.uid,
      url,
      platform,
      visibility,
      tags,
    });
    
    // Always return the jobId and mediaItem if completed
    res.json({ 
      success: true, 
      data: { 
        jobId: result.jobId,
        mediaItem: result.mediaItem,
        message: result.mediaItem ? 'Download completed successfully!' : 'Download completed with real-time progress!'
      } 
    });
  } catch (error) {
    console.error('Download error:', error);
    throw createError(`Download failed: ${(error as Error).message}`, 500);
  }
}));

// Submit a URL for background processing (legacy endpoint)
router.post('/submit-job', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { url, visibility = 'private', tags = [] } = req.body;
  
  if (!url || !validateUrl(url)) {
    throw createError('Valid URL is required', 400);
  }
  
  const platform = detectPlatform(url);
  if (!platform) {
    throw createError('Unsupported platform', 400);
  }
  
  const mediaDownloadService = new MediaDownloadService();
  
  // Create a download job for background processing
  const jobId = await mediaDownloadService.createDownloadJob({
    userId: req.user.uid,
    url,
    platform,
    visibility,
    tags,
  });
  
  res.json({ 
    success: true, 
    data: { 
      jobId, 
      message: 'Download job created. You will be notified when complete.' 
    } 
  });
}));

// Upload media file directly
router.post('/upload', authenticateToken, upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    throw createError('No file uploaded', 400);
  }
  
  const { title, description, visibility = 'private', tags = [] } = req.body;
  
  const mediaDownloadService = new MediaDownloadService();
  
  // Process and upload file
  const mediaItem = await mediaDownloadService.processDirectUpload({
    file: req.file,
    userId: req.user.uid,
    title,
    description,
    visibility,
    tags: JSON.parse(tags || '[]'),
  });
  
  res.json({ success: true, data: mediaItem });
}));

// Get download job status
router.get('/job/:jobId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaDownloadService = new MediaDownloadService();
  const job = await mediaDownloadService.getJobStatus(req.params.jobId, req.user.uid);
  res.json({ success: true, data: job });
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
    visibility,
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
  const mediaDownloadService = new MediaDownloadService();
  const backblazeService = new BackblazeService();
  
  // Get all media items for the user
  const db = require('firebase-admin/firestore').getFirestore();
  const mediaQuery = await db.collection('media')
    .where('userId', '==', req.user.uid)
    .get();
  
  let fixedCount = 0;
  
  for (const doc of mediaQuery.docs) {
    const mediaItem = doc.data();
    
    if (mediaItem.files && mediaItem.files.length > 0) {
      const updatedFiles = [];
      
      for (const file of mediaItem.files) {
        if (file.b2FileName) {
          // Generate new correct URL
          const newDownloadUrl = await backblazeService.getDownloadUrl(file.b2FileName);
          
          updatedFiles.push({
            ...file,
            downloadUrl: newDownloadUrl
          });
        } else {
          updatedFiles.push(file);
        }
      }
      
      // Update the document
      await db.collection('media').doc(doc.id).update({
        files: updatedFiles
      });
      
      fixedCount++;
    }
  }
  
  res.json({ 
    success: true, 
    message: `Fixed download URLs for ${fixedCount} media items` 
  });
}));

export default router; 