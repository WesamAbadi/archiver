import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import prisma from '../lib/database';
import { User } from '../types';

const router: Router = Router();

// Get user profile
router.get('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { uid: req.user.uid },
  });
  
  if (!user) {
    res.status(404).json({
      success: false,
      error: 'User not found',
    });
    return;
  }
  
  res.json({ success: true, data: user });
}));

// Update user profile
router.patch('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { displayName, photoURL, defaultVisibility, sortOrder, autoGenerateMetadata, notificationsEnabled } = req.body;
  
  const updateData: any = {};
  
  if (displayName !== undefined) updateData.displayName = displayName;
  if (photoURL !== undefined) updateData.photoURL = photoURL;
  if (defaultVisibility !== undefined) updateData.defaultVisibility = defaultVisibility;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (autoGenerateMetadata !== undefined) updateData.autoGenerateMetadata = autoGenerateMetadata;
  if (notificationsEnabled !== undefined) updateData.notificationsEnabled = notificationsEnabled;
  
  const user = await prisma.user.update({
    where: { uid: req.user.uid },
    data: updateData,
  });
  
  res.json({ success: true, data: user });
}));

// Get user's public profile (for public archive)
router.get('/public/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const user = await prisma.user.findUnique({
    where: { uid: userId },
    select: {
      displayName: true,
      photoURL: true,
      createdAt: true,
    },
  });
  
  if (!user) {
    res.status(404).json({
      success: false,
      error: 'User not found',
    });
    return;
  }
  
  res.json({ success: true, data: user });
}));

// Get user usage statistics
router.get('/usage', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { uid: req.user.uid },
    include: {
      mediaItems: {
        select: {
          size: true,
        },
      },
      downloadJobs: {
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      },
    },
  });
  
  if (!user) {
    res.status(404).json({
      success: false,
      error: 'User not found',
    });
    return;
  }
  
  const totalItems = user.mediaItems.length;
  const totalSize = user.mediaItems.reduce((sum, item) => {
    return sum + Number(item.size);
  }, 0);
  const recentDownloads = user.downloadJobs.length;
  
  const usage = {
    totalItems,
    totalSize,
    recentDownloads,
    storageUsed: totalSize,
    // Add storage limits based on your pricing model
    storageLimit: 10 * 1024 * 1024 * 1024, // 10GB default
  };
  
  res.json({ success: true, data: usage });
}));

export default router; 