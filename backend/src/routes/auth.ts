import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { verifyGoogleToken, generateJWT, findOrCreateUser } from '../lib/auth';
import prisma from '../lib/database';
import { UserPreferences, Visibility, SortOrder } from '../types';

const router: Router = Router();

// Debug endpoint to check configuration
router.get('/debug', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      googleClientId: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
      jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
      databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set',
      environment: process.env.NODE_ENV || 'development',
    },
  });
}));

// Google OAuth login
router.post('/google', asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    res.status(400).json({
      success: false,
      error: 'Google token is required',
    });
    return;
  }
  
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(500).json({
      success: false,
      error: 'Google Client ID not configured on server',
    });
    return;
  }

  if (!process.env.JWT_SECRET) {
    res.status(500).json({
      success: false,
      error: 'JWT Secret not configured on server',
    });
    return;
  }
  
  try {
    console.log('Verifying Google token...');
    // Verify Google token
    const googlePayload = await verifyGoogleToken(token);
    console.log('Google token verified for user:', googlePayload.email);
    
    // Find or create user
    const user = await findOrCreateUser(googlePayload);
    console.log('User found/created:', user.email);
    
    // Generate JWT
    const jwt = generateJWT({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || undefined,
    });
    console.log('JWT generated successfully');
    
    res.json({
      success: true,
      data: {
        user,
        token: jwt,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({
      success: false,
      error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}));

// Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
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

// Update user preferences
router.patch('/preferences', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { 
    defaultVisibility, 
    sortOrder, 
    autoGenerateMetadata, 
    notificationsEnabled 
  } = req.body;
  
  const updateData: any = {};
  
  if (defaultVisibility !== undefined) {
    updateData.defaultVisibility = defaultVisibility as Visibility;
  }
  if (sortOrder !== undefined) {
    updateData.sortOrder = sortOrder as SortOrder;
  }
  if (autoGenerateMetadata !== undefined) {
    updateData.autoGenerateMetadata = autoGenerateMetadata;
  }
  if (notificationsEnabled !== undefined) {
    updateData.notificationsEnabled = notificationsEnabled;
  }
  
  const user = await prisma.user.update({
    where: { uid: req.user.uid },
    data: updateData,
  });
  
  res.json({ success: true, data: user });
}));

// Update user profile
router.patch('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { displayName, photoURL } = req.body;
  
  const updateData: any = {};
  if (displayName !== undefined) updateData.displayName = displayName;
  if (photoURL !== undefined) updateData.photoURL = photoURL;
  
  const user = await prisma.user.update({
    where: { uid: req.user.uid },
    data: updateData,
  });
  
  res.json({ success: true, data: user });
}));

// Delete user account
router.delete('/account', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Prisma will handle cascading deletes based on schema
  await prisma.user.delete({
    where: { uid: req.user.uid },
  });
  
  res.json({ success: true, message: 'Account deleted successfully' });
}));

export default router; 