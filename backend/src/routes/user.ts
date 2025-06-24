import { Router } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { User } from '../types';

const router: Router = Router();
const db = getFirestore();

// Get user profile
router.get('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userDoc = await db.collection('users').doc(req.user.uid).get();
  
  if (!userDoc.exists) {
    // Create user profile if it doesn't exist
    const newUser: User = {
      uid: req.user.uid,
      email: req.user.email!,
      displayName: req.user.displayName || '',
      createdAt: new Date(),
      preferences: {
        defaultVisibility: 'private',
        sortOrder: 'newest',
        autoGenerateMetadata: true,
        notificationsEnabled: true,
      },
    };
    
    await db.collection('users').doc(req.user.uid).set(newUser);
    res.json({ success: true, data: newUser });
    return;
  }
  
  const userData = userDoc.data();
  res.json({ success: true, data: userData });
}));

// Update user profile
router.patch('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { displayName, photoURL, preferences } = req.body;
  
  const updateData: any = {
    updatedAt: new Date(),
  };
  
  if (displayName !== undefined) updateData.displayName = displayName;
  if (photoURL !== undefined) updateData.photoURL = photoURL;
  if (preferences !== undefined) updateData.preferences = preferences;
  
  await db.collection('users').doc(req.user.uid).update(updateData);
  
  res.json({ success: true, message: 'Profile updated successfully' });
}));

// Get user's public profile (for public archive)
router.get('/public/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    res.status(404).json({
      success: false,
      error: 'User not found',
    });
    return;
  }
  
  const userData = userDoc.data();
  
  // Only return public information
  const publicProfile = {
    displayName: userData?.displayName,
    photoURL: userData?.photoURL,
    createdAt: userData?.createdAt,
  };
  
  res.json({ success: true, data: publicProfile });
}));

// Get user usage statistics
router.get('/usage', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaQuery = await db.collection('media')
    .where('userId', '==', req.user.uid)
    .get();
  
  const totalItems = mediaQuery.size;
  const totalSize = mediaQuery.docs.reduce((sum, doc) => {
    const data = doc.data();
    return sum + (data.metadata?.size || 0);
  }, 0);
  
  // Get download jobs in last 30 days - handle index requirement gracefully
  let recentDownloads = 0;
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentJobsQuery = await db.collection('downloadJobs')
      .where('userId', '==', req.user.uid)
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();
    
    recentDownloads = recentJobsQuery.size;
  } catch (error: any) {
    // If index doesn't exist, fall back to counting all jobs for this user
    console.log('Composite index not available, using fallback query');
    try {
      const allJobsQuery = await db.collection('downloadJobs')
        .where('userId', '==', req.user.uid)
        .get();
      recentDownloads = allJobsQuery.size;
    } catch (fallbackError) {
      console.log('Fallback query also failed, using default value');
      recentDownloads = 0;
    }
  }
  
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