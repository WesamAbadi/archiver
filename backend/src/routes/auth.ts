import { Router } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { User, UserPreferences } from '../types';

const router: Router = Router();
const db = getFirestore();

// Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
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
  } else {
    res.json({ success: true, data: userDoc.data() });
  }
}));

// Update user preferences
router.patch('/preferences', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { preferences } = req.body;
  
  await db.collection('users').doc(req.user.uid).update({
    preferences,
    updatedAt: new Date(),
  });
  
  res.json({ success: true, message: 'Preferences updated successfully' });
}));

// Delete user account
router.delete('/account', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Delete user's media items
  const mediaQuery = await db.collection('media')
    .where('userId', '==', req.user.uid)
    .get();
  
  const batch = db.batch();
  mediaQuery.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  // Delete user profile
  batch.delete(db.collection('users').doc(req.user.uid));
  
  await batch.commit();
  
  res.json({ success: true, message: 'Account deleted successfully' });
}));

export default router; 