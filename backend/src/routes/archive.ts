import { Router, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateToken, AuthenticatedRequest, optionalAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { MediaItem, PaginatedResponse } from '../types';

const router: Router = Router();
const db = getFirestore();

// Get user's archive with pagination and filters
router.get('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const {
    page = 1,
    limit = 20,
    platform,
    tags,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;
  
  let query = db.collection('media')
    .where('userId', '==', req.user.uid);
  
  // Apply filters
  if (platform) {
    query = query.where('platform', '==', platform);
  }
  
  if (tags) {
    const tagArray = (tags as string).split(',');
    query = query.where('tags', 'array-contains-any', tagArray);
  }
  
  // Apply sorting
  query = query.orderBy(sortBy as string, sortOrder as 'asc' | 'desc');
  
  // Get total count for pagination
  const totalQuery = await query.get();
  const total = totalQuery.size;
  
  // Apply pagination
  query = query.offset(offset).limit(limitNum);
  
  let results = await query.get();
  let items = results.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MediaItem[];
  
  // Apply text search if provided (client-side filtering for now)
  if (search) {
    const searchTerm = (search as string).toLowerCase();
    items = items.filter(item => 
      item.title.toLowerCase().includes(searchTerm) ||
      item.description?.toLowerCase().includes(searchTerm) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }
  
  const totalPages = Math.ceil(total / limitNum);
  
  const response: PaginatedResponse<MediaItem> = {
    success: true,
    data: items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
  
  res.json(response);
}));

// Get public archive by user ID
router.get('/public/:userId', optionalAuth, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;
  
  let query = db.collection('media')
    .where('userId', '==', userId)
    .where('visibility', '==', 'public')
    .orderBy('createdAt', 'desc')
    .offset(offset)
    .limit(limitNum);
  
  const results = await query.get();
  const items = results.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MediaItem[];
  
  // Get user info for public profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userInfo = userDoc.exists ? {
    displayName: userDoc.data()?.displayName,
    photoURL: userDoc.data()?.photoURL,
  } : null;
  
  res.json({
    success: true,
    data: {
      items,
      user: userInfo,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasNext: items.length === limitNum,
      },
    },
  });
}));

// Get public media item by public ID
router.get('/public/item/:publicId', asyncHandler(async (req, res) => {
  const { publicId } = req.params;
  
  const query = await db.collection('media')
    .where('publicId', '==', publicId)
    .where('visibility', '==', 'public')
    .limit(1)
    .get();
  
  if (query.empty) {
    res.status(404).json({
      success: false,
      error: 'Media item not found or is private',
    });
    return;
  }
  
  const item = { id: query.docs[0].id, ...query.docs[0].data() } as MediaItem;
  res.json({ success: true, data: item });
}));

// Get archive statistics
router.get('/stats', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const mediaQuery = await db.collection('media')
    .where('userId', '==', req.user.uid)
    .get();
  
  const items = mediaQuery.docs.map(doc => doc.data()) as MediaItem[];
  
  const stats = {
    totalItems: items.length,
    totalSize: items.reduce((sum, item) => {
      // Safely handle metadata.size
      const size = item.metadata?.size || (item.files?.[0]?.size) || 0;
      return sum + size;
    }, 0),
    platformBreakdown: items.reduce((acc, item) => {
      acc[item.platform] = (acc[item.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    visibilityBreakdown: items.reduce((acc, item) => {
      acc[item.visibility] = (acc[item.visibility] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    recentActivity: items
      .filter(item => item.createdAt) // Filter out items without createdAt
      .sort((a, b) => {
        // Handle both Firestore Timestamp and Date objects
        const dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt as any).toDate();
        const dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt as any).toDate();
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5),
  };
  
  res.json({ success: true, data: stats });
}));

// Get public homepage feed (trending/recommended content)
router.get('/feed', optionalAuth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type = 'all' } = req.query;
  const userId = (req as any).user?.uid;
  
  const pageNum = parseInt(page as string);
  const limitNum = Math.min(parseInt(limit as string), 50);
  const offset = (pageNum - 1) * limitNum;

  try {
    // Get public media items with engagement metrics
    let query = db.collection('media')
      .where('visibility', '==', 'public')
      .orderBy('createdAt', 'desc');

    // Filter by media type if specified
    if (type !== 'all') {
      // We'll add platform filtering or metadata-based filtering
      if (type === 'video') {
        query = query.where('platform', 'in', ['youtube', 'twitter']);
      } else if (type === 'audio') {
        query = query.where('platform', '==', 'soundcloud');
      } else if (type === 'image') {
        query = query.where('platform', '==', 'twitter'); // Twitter can have images
      }
    }

    const snapshot = await query.limit(limitNum).offset(offset).get();
    
    const items = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();
      
      // Get engagement stats
      const likesSnapshot = await db.collection('likes')
        .where('mediaId', '==', doc.id)
        .get();
      
      const commentsSnapshot = await db.collection('comments')
        .where('mediaId', '==', doc.id)
        .get();

      // Get uploader info
      const uploaderDoc = await db.collection('users').doc(data.userId).get();
      const uploaderData = uploaderDoc.data();

      // Check if current user liked this item
      let isLiked = false;
      if (userId) {
        const userLikeDoc = await db.collection('likes')
          .where('mediaId', '==', doc.id)
          .where('userId', '==', userId)
          .limit(1)
          .get();
        isLiked = !userLikeDoc.empty;
      }

      return {
        id: doc.id,
        ...data,
        uploader: {
          id: data.userId,
          displayName: uploaderData?.displayName || 'Anonymous',
          photoURL: uploaderData?.photoURL,
        },
        engagement: {
          likes: likesSnapshot.size,
          comments: commentsSnapshot.size,
          isLiked,
        },
      };
    }));

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: items.length === limitNum,
        },
      },
    });
  } catch (error) {
    console.error('Feed query error:', error);
    
    // Return empty result with helpful message if no indexes exist yet
    res.json({
      success: true,
      data: {
        items: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: false,
        },
      },
      message: 'No public content available yet. Upload some public content to get started!',
    });
  }
}));

// Get trending content (most engaged with in last 7 days)
router.get('/trending', optionalAuth, asyncHandler(async (req, res) => {
  const { limit = 20, type = 'all' } = req.query;
  const userId = (req as any).user?.uid;
  const limitNum = Math.min(parseInt(limit as string), 50);
  
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get recent public media
    let query = db.collection('media')
      .where('visibility', '==', 'public')
      .where('createdAt', '>=', sevenDaysAgo)
      .orderBy('createdAt', 'desc');

    const snapshot = await query.limit(limitNum * 3).get(); // Get more to sort by engagement
    
    const itemsWithEngagement = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();
      
      // Get recent engagement
      const likesSnapshot = await db.collection('likes')
        .where('mediaId', '==', doc.id)
        .where('createdAt', '>=', sevenDaysAgo)
        .get();
      
      const commentsSnapshot = await db.collection('comments')
        .where('mediaId', '==', doc.id)
        .where('createdAt', '>=', sevenDaysAgo)
        .get();

      const uploaderDoc = await db.collection('users').doc(data.userId).get();
      const uploaderData = uploaderDoc.data();

      let isLiked = false;
      if (userId) {
        const userLikeDoc = await db.collection('likes')
          .where('mediaId', '==', doc.id)
          .where('userId', '==', userId)
          .limit(1)
          .get();
        isLiked = !userLikeDoc.empty;
      }

      const engagementScore = likesSnapshot.size * 2 + commentsSnapshot.size * 3;

      return {
        id: doc.id,
        ...data,
        uploader: {
          id: data.userId,
          displayName: uploaderData?.displayName || 'Anonymous',
          photoURL: uploaderData?.photoURL,
        },
        engagement: {
          likes: likesSnapshot.size,
          comments: commentsSnapshot.size,
          isLiked,
          score: engagementScore,
        },
      };
    }));

    // Sort by engagement score and take top items
    const trendingItems = itemsWithEngagement
      .sort((a, b) => b.engagement.score - a.engagement.score)
      .slice(0, limitNum);

    res.json({
      success: true,
      data: trendingItems,
    });
  } catch (error) {
    console.error('Trending query error:', error);
    
    // Fallback: Get recent public media without date filter if index is missing
    try {
      let fallbackQuery = db.collection('media')
        .where('visibility', '==', 'public')
        .orderBy('createdAt', 'desc')
        .limit(limitNum);

      const fallbackSnapshot = await fallbackQuery.get();
      
      const fallbackItems = await Promise.all(fallbackSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        
        const uploaderDoc = await db.collection('users').doc(data.userId).get();
        const uploaderData = uploaderDoc.data();

        let isLiked = false;
        if (userId) {
          const userLikeDoc = await db.collection('likes')
            .where('mediaId', '==', doc.id)
            .where('userId', '==', userId)
            .limit(1)
            .get();
          isLiked = !userLikeDoc.empty;
        }

        return {
          id: doc.id,
          ...data,
          uploader: {
            id: data.userId,
            displayName: uploaderData?.displayName || 'Anonymous',
            photoURL: uploaderData?.photoURL,
          },
          engagement: {
            likes: 0,
            comments: 0,
            isLiked,
            score: 0,
          },
        };
      }));

      res.json({
        success: true,
        data: fallbackItems,
        message: 'Using fallback trending (database index pending)',
      });
    } catch (fallbackError) {
      console.error('Fallback trending query error:', fallbackError);
      res.json({
        success: true,
        data: [],
        message: 'No trending content available yet',
      });
    }
  }
}));

// Get public media item by ID or publicId
router.get('/media/:id', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).user?.uid;
  
  // Try to find by document ID first, then by publicId
  let mediaDoc = await db.collection('media').doc(id).get();
  
  if (!mediaDoc.exists) {
    // Try finding by publicId
    const publicIdQuery = await db.collection('media')
      .where('publicId', '==', id)
      .where('visibility', '==', 'public')
      .limit(1)
      .get();
    
    if (publicIdQuery.empty) {
      return res.status(404).json({
        success: false,
        error: 'Media not found or not public',
      });
    }
    
    mediaDoc = publicIdQuery.docs[0];
  }

  const data = mediaDoc.data();
  
  // Check if it's public
  if (data?.visibility !== 'public') {
    return res.status(404).json({
      success: false,
      error: 'Media not found or not public',
    });
  }

  // Get engagement stats
  const likesSnapshot = await db.collection('likes')
    .where('mediaId', '==', mediaDoc.id)
    .get();
  
  const commentsSnapshot = await db.collection('comments')
    .where('mediaId', '==', mediaDoc.id)
    .get();

  // Get comments with user info
  const comments = await Promise.all(commentsSnapshot.docs.map(async (commentDoc) => {
    const commentData = commentDoc.data();
    const userDoc = await db.collection('users').doc(commentData.userId).get();
    const userData = userDoc.data();
    
    return {
      id: commentDoc.id,
      ...commentData,
      user: {
        id: commentData.userId,
        displayName: userData?.displayName || 'Anonymous',
        photoURL: userData?.photoURL,
      },
    };
  }));

  // Sort comments by createdAt (newest first) in memory
  comments.sort((a, b) => {
    const commentA = a as any;
    const commentB = b as any;
    
    if (!commentA.createdAt || !commentB.createdAt) return 0;
    
    const dateA = commentA.createdAt instanceof Date ? commentA.createdAt : commentA.createdAt.toDate();
    const dateB = commentB.createdAt instanceof Date ? commentB.createdAt : commentB.createdAt.toDate();
    return dateB.getTime() - dateA.getTime();
  });

  // Get uploader info
  const uploaderDoc = await db.collection('users').doc(data.userId).get();
  const uploaderData = uploaderDoc.data();

  // Check if current user liked this item
  let isLiked = false;
  if (userId) {
    const userLikeDoc = await db.collection('likes')
      .where('mediaId', '==', mediaDoc.id)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    isLiked = !userLikeDoc.empty;
  }

  // Increment view count (optional - you can add this field to track views)
  await db.collection('media').doc(mediaDoc.id).update({
    viewCount: (data.viewCount || 0) + 1,
  });

  res.json({
    success: true,
    data: {
      id: mediaDoc.id,
      ...data,
      uploader: {
        id: data.userId,
        displayName: uploaderData?.displayName || 'Anonymous',
        photoURL: uploaderData?.photoURL,
        createdAt: uploaderData?.createdAt,
      },
      engagement: {
        likes: likesSnapshot.size,
        comments: commentsSnapshot.size,
        views: (data.viewCount || 0) + 1,
        isLiked,
      },
      comments,
    },
  });
}));

// Like/unlike a media item
router.post('/media/:id/like', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  // Check if media exists and is public
  const mediaDoc = await db.collection('media').doc(id).get();
  if (!mediaDoc.exists || mediaDoc.data()?.visibility !== 'public') {
    return res.status(404).json({
      success: false,
      error: 'Media not found or not public',
    });
  }

  // Check if user already liked this
  const existingLike = await db.collection('likes')
    .where('mediaId', '==', id)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (existingLike.empty) {
    // Add like
    await db.collection('likes').add({
      mediaId: id,
      userId,
      createdAt: new Date(),
    });
    
    res.json({
      success: true,
      data: { liked: true },
    });
  } else {
    // Remove like
    await db.collection('likes').doc(existingLike.docs[0].id).delete();
    
    res.json({
      success: true,
      data: { liked: false },
    });
  }
}));

// Add a comment to a media item
router.post('/media/:id/comment', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.uid;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Comment content is required',
    });
  }

  // Check if media exists and is public
  const mediaDoc = await db.collection('media').doc(id).get();
  if (!mediaDoc.exists || mediaDoc.data()?.visibility !== 'public') {
    return res.status(404).json({
      success: false,
      error: 'Media not found or not public',
    });
  }

  // Add comment
  const commentDoc = await db.collection('comments').add({
    mediaId: id,
    userId,
    content: content.trim(),
    createdAt: new Date(),
  });

  // Get user info for the response
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  res.json({
    success: true,
    data: {
      id: commentDoc.id,
      mediaId: id,
      userId,
      content: content.trim(),
      createdAt: new Date(),
      user: {
        id: userId,
        displayName: userData?.displayName || 'Anonymous',
        photoURL: userData?.photoURL,
      },
    },
  });
}));

export default router; 