import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, optionalAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { MediaItem, PaginatedResponse, Visibility, Platform, SortOrder } from '../types';
import prisma from '../lib/database';

const router: Router = Router();

// Helper function to ensure user exists and get their database ID
async function ensureUserExists(userUid: string): Promise<string> {
  let user = await prisma.user.findUnique({
    where: { uid: userUid }
  });

  if (!user) {
    // If user doesn't exist, create them with minimal data
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

// Helper function to serialize BigInt fields to strings
function serializeMediaItems(items: any[]): any[] {
  return items.map(item => ({
    ...item,
    size: item.size ? item.size.toString() : null,
    files: item.files?.map((file: any) => ({
      ...file,
      size: file.size ? file.size.toString() : null
    })) || []
  }));
}

// Helper function to get engagement data for media items
async function getEngagementData(mediaItemIds: string[], currentUserUid?: string): Promise<Map<string, any>> {
  const engagementMap = new Map();
  
  if (mediaItemIds.length === 0) return engagementMap;
  
  // Convert OAuth UID to database user ID if provided
  let currentUserId: string | undefined = undefined;
  if (currentUserUid) {
    const user = await prisma.user.findUnique({
      where: { uid: currentUserUid },
      select: { id: true }
    });
    currentUserId = user?.id;
  }
  
  // Get like counts and user's likes
  const [likeCounts, userLikes, commentCounts] = await Promise.all([
    prisma.like.groupBy({
      by: ['mediaItemId'],
      where: { mediaItemId: { in: mediaItemIds } },
      _count: { id: true },
    }),
    currentUserId ? prisma.like.findMany({
      where: {
        mediaItemId: { in: mediaItemIds },
        userId: currentUserId,
      },
      select: { mediaItemId: true },
    }) : [],
    prisma.comment.groupBy({
      by: ['mediaItemId'],
      where: { mediaItemId: { in: mediaItemIds } },
      _count: { id: true },
    }),
  ]);
  
  // Create a map of user's liked items
  const userLikedSet = new Set(userLikes.map(like => like.mediaItemId));
  
  // Build engagement data
  for (const itemId of mediaItemIds) {
    const likeCount = likeCounts.find(l => l.mediaItemId === itemId)?._count.id || 0;
    const commentCount = commentCounts.find(c => c.mediaItemId === itemId)?._count.id || 0;
    const isLiked = userLikedSet.has(itemId);
    
    engagementMap.set(itemId, {
      likes: likeCount,
      comments: commentCount,
      isLiked,
    });
  }
  
  return engagementMap;
}

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
  
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid);
  
  // Build where clause
  const where: any = {
    userId: dbUserId, // Use database user ID
  };
  
  if (platform) {
    where.platform = (platform as string).toUpperCase();
  }
  
  if (tags) {
    const tagArray = (tags as string).split(',');
    where.tags = {
      hasSome: tagArray,
    };
  }
  
  // Build search filter
  if (search) {
    const searchTerm = search as string;
    where.OR = [
      { title: { contains: searchTerm, mode: 'insensitive' } },
      { description: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }
  
  // Build order by
  const orderBy: any = {};
  orderBy[sortBy as string] = sortOrder as 'asc' | 'desc';
  
  // Get total count and items
  const [total, items] = await Promise.all([
    prisma.mediaItem.count({ where }),
    prisma.mediaItem.findMany({
      where,
      include: {
        files: true,
      },
      orderBy,
      skip: offset,
      take: limitNum,
    }),
  ]);
  
  const totalPages = Math.ceil(total / limitNum);
  
  const response: PaginatedResponse<MediaItem> = {
    success: true,
    data: serializeMediaItems(items), // Serialize BigInt fields
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
  
  const items = await prisma.mediaItem.findMany({
    where: {
      userId: userId,
      visibility: 'PUBLIC',
    },
    include: {
      files: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: offset,
    take: limitNum,
  });
  
  // Get user info for public profile
  const userInfo = await prisma.user.findUnique({
    where: { uid: userId },
    select: {
      displayName: true,
      photoURL: true,
    },
  });
  
  res.json({
    success: true,
    data: {
      items: serializeMediaItems(items), // Serialize BigInt fields
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
  
  const item = await prisma.mediaItem.findFirst({
    where: {
      publicId: publicId,
      visibility: 'PUBLIC',
    },
    include: {
      files: true,
    },
  });
  
  if (!item) {
    res.status(404).json({
      success: false,
      error: 'Media item not found or is private',
    });
    return;
  }
  
  // Serialize BigInt fields
  const serializedItem = serializeMediaItems([item])[0];
  
  res.json({ success: true, data: serializedItem });
}));

// Get archive statistics
router.get('/stats', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Ensure user exists and get their database ID
  const dbUserId = await ensureUserExists(req.user.uid);
  
  const items = await prisma.mediaItem.findMany({
    where: {
      userId: dbUserId, // Use database user ID
    },
    include: {
      files: true,
    },
  });
  
  const stats = {
    totalItems: items.length,
    totalSize: items.reduce((sum, item) => {
      const size = Number(item.size) || (item.files?.[0] ? Number(item.files[0].size) : 0);
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
    recentActivity: serializeMediaItems(
      items
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
    ),
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
    // Build where clause for feed
    const where: any = {
      visibility: 'PUBLIC',
    };

    // Filter by media type if specified
    if (type !== 'all') {
      if (type === 'video') {
        where.platform = { in: ['YOUTUBE', 'TWITTER'] };
      } else if (type === 'audio') {
        where.platform = 'SOUNDCLOUD';
      } else if (type === 'image') {
        where.platform = 'TWITTER';
      }
    }

    const items = await prisma.mediaItem.findMany({
      where,
      include: {
        files: true,
        user: {
          select: {
            uid: true,
            displayName: true,
            photoURL: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limitNum,
    });

    // Get engagement data for all items
    const itemIds = items.map(item => item.id);
    const engagementData = await getEngagementData(itemIds, userId);

    // Serialize BigInt fields and add engagement data
    const enhancedItems = serializeMediaItems(items).map(item => ({
      ...item,
      uploader: {
        id: item.user?.uid,
        displayName: item.user?.displayName || 'Anonymous',
        photoURL: item.user?.photoURL,
      },
      engagement: engagementData.get(item.id) || {
        likes: 0,
        comments: 0,
        isLiked: false,
      },
    }));

    res.json({
      success: true,
      data: {
        items: enhancedItems,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: items.length === limitNum,
        },
      },
    });
  } catch (error) {
    console.error('Feed query error:', error);
    
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

// Get trending content (most recent public content for now)
router.get('/trending', optionalAuth, asyncHandler(async (req, res) => {
  const { limit = 20, type = 'all' } = req.query;
  const userId = (req as any).user?.uid;
  const limitNum = Math.min(parseInt(limit as string), 50);
  
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Build where clause
    const where: any = {
      visibility: 'PUBLIC',
      createdAt: {
        gte: sevenDaysAgo,
      },
    };

    const items = await prisma.mediaItem.findMany({
      where,
      include: {
        files: true,
        user: {
          select: {
            uid: true,
            displayName: true,
            photoURL: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limitNum,
    });

    // Get engagement data for all items
    const itemIds = items.map(item => item.id);
    const engagementData = await getEngagementData(itemIds, userId);

    // Serialize BigInt fields and add engagement scoring
    const trendingItems = serializeMediaItems(items).map(item => ({
      ...item,
      uploader: {
        id: item.user?.uid,
        displayName: item.user?.displayName || 'Anonymous',
        photoURL: item.user?.photoURL,
      },
      engagement: {
        ...engagementData.get(item.id) || {
          likes: 0,
          comments: 0,
          isLiked: false,
        },
        score: 0,
      },
    }));

    res.json({
      success: true,
      data: trendingItems,
    });
  } catch (error) {
    console.error('Trending query error:', error);
    
    // Fallback: Get recent public media
    try {
      const fallbackItems = await prisma.mediaItem.findMany({
        where: {
          visibility: 'PUBLIC',
        },
        include: {
          files: true,
          user: {
            select: {
              uid: true,
              displayName: true,
              photoURL: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limitNum,
      });

      // Get engagement data for fallback items
      const fallbackItemIds = fallbackItems.map(item => item.id);
      const fallbackEngagementData = await getEngagementData(fallbackItemIds, userId);

      const enhancedFallbackItems = serializeMediaItems(fallbackItems).map(item => ({
        ...item,
        uploader: {
          id: item.user?.uid,
          displayName: item.user?.displayName || 'Anonymous',
          photoURL: item.user?.photoURL,
        },
        engagement: {
          ...fallbackEngagementData.get(item.id) || {
            likes: 0,
            comments: 0,
            isLiked: false,
          },
          score: 0,
        },
      }));

      res.json({
        success: true,
        data: enhancedFallbackItems,
        message: 'Showing recent public content',
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
  let mediaItem = await prisma.mediaItem.findFirst({
    where: {
      OR: [
        { id: id },
        { publicId: id },
      ],
      visibility: 'PUBLIC',
    },
    include: {
      files: true,
      user: {
        select: {
          uid: true,
          displayName: true,
          photoURL: true,
        },
      },
    },
  });
  
  if (!mediaItem) {
    return res.status(404).json({
      success: false,
      error: 'Media not found or not public',
    });
  }

  // Get engagement data and comments
  const [engagementData, comments] = await Promise.all([
    getEngagementData([mediaItem.id], userId),
    prisma.comment.findMany({
      where: { mediaItemId: mediaItem.id },
      include: {
        user: {
          select: {
            uid: true,
            displayName: true,
            photoURL: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Serialize BigInt fields first
  const serializedItem = serializeMediaItems([mediaItem])[0];

  // Add engagement data and comments
  const enhancedItem = {
    ...serializedItem,
    uploader: {
      id: serializedItem.user?.uid,
      displayName: serializedItem.user?.displayName || 'Anonymous',
      photoURL: serializedItem.user?.photoURL,
    },
    engagement: engagementData.get(mediaItem.id) || {
      likes: 0,
      comments: 0,
      isLiked: false,
    },
    comments: comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        id: comment.user.uid,
        displayName: comment.user.displayName || 'Anonymous',
        photoURL: comment.user.photoURL,
      },
    })),
  };

  res.json({
    success: true,
    data: enhancedItem,
  });
}));

// Like/unlike media item (placeholder for future implementation)
router.post('/media/:id/like', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const dbUserId = await ensureUserExists(req.user.uid);
  
  // Check if media item exists and is public
  const mediaItem = await prisma.mediaItem.findFirst({
    where: {
      OR: [
        { id: id },
        { publicId: id },
      ],
      visibility: 'PUBLIC',
    },
  });
  
  if (!mediaItem) {
    return res.status(404).json({
      success: false,
      error: 'Media item not found or not public',
    });
  }
  
  // Check if user already liked this item
  const existingLike = await prisma.like.findUnique({
    where: {
      userId_mediaItemId: {
        userId: dbUserId,
        mediaItemId: mediaItem.id,
      },
    },
  });
  
  if (existingLike) {
    // Unlike - remove the like
    await prisma.like.delete({
      where: {
        id: existingLike.id,
      },
    });
    
    // Get updated engagement data
    const engagementData = await getEngagementData([mediaItem.id], req.user.uid);
    const engagement = engagementData.get(mediaItem.id) || { likes: 0, comments: 0, isLiked: false };
    
    res.json({
      success: true,
      data: {
        isLiked: false,
        action: 'unliked',
        engagement,
      },
    });
  } else {
    // Like - create a new like
    await prisma.like.create({
      data: {
        userId: dbUserId,
        mediaItemId: mediaItem.id,
      },
    });
    
    // Get updated engagement data
    const engagementData = await getEngagementData([mediaItem.id], req.user.uid);
    const engagement = engagementData.get(mediaItem.id) || { likes: 0, comments: 0, isLiked: false };
    
    res.json({
      success: true,
      data: {
        isLiked: true,
        action: 'liked',
        engagement,
      },
    });
  }
}));

// Add comment to media item (placeholder for future implementation)
router.post('/media/:id/comment', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const dbUserId = await ensureUserExists(req.user.uid);
  
  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Comment content is required',
    });
  }
  
  if (content.length > 1000) {
    return res.status(400).json({
      success: false,
      error: 'Comment content must be less than 1000 characters',
    });
  }
  
  // Check if media item exists and is public
  const mediaItem = await prisma.mediaItem.findFirst({
    where: {
      OR: [
        { id: id },
        { publicId: id },
      ],
      visibility: 'PUBLIC',
    },
  });
  
  if (!mediaItem) {
    return res.status(404).json({
      success: false,
      error: 'Media item not found or not public',
    });
  }
  
  // Create the comment
  const comment = await prisma.comment.create({
    data: {
      userId: dbUserId,
      mediaItemId: mediaItem.id,
      content: content.trim(),
    },
    include: {
      user: {
        select: {
          uid: true,
          displayName: true,
          photoURL: true,
        },
      },
    },
  });
  
  // Get updated engagement data
  const engagementData = await getEngagementData([mediaItem.id], req.user.uid);
  const engagement = engagementData.get(mediaItem.id) || { likes: 0, comments: 0, isLiked: false };
  
  res.json({
    success: true,
    data: {
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: {
          id: comment.user.uid,
          displayName: comment.user.displayName || 'Anonymous',
          photoURL: comment.user.photoURL,
        },
      },
      engagement,
    },
  });
}));

// Get comments for a media item
router.get('/media/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).user?.uid;
  
  // Check if media item exists and is public
  const mediaItem = await prisma.mediaItem.findFirst({
    where: {
      OR: [
        { id: id },
        { publicId: id },
      ],
      visibility: 'PUBLIC',
    },
  });
  
  if (!mediaItem) {
    return res.status(404).json({
      success: false,
      error: 'Media item not found or not public',
    });
  }
  
  // Get comments for the media item
  const comments = await prisma.comment.findMany({
    where: {
      mediaItemId: mediaItem.id,
    },
    include: {
      user: {
        select: {
          uid: true,
          displayName: true,
          photoURL: true,
        },
      },
    },
  });
  
  res.json({
    success: true,
    data: comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        id: comment.user.uid,
        displayName: comment.user.displayName || 'Anonymous',
        photoURL: comment.user.photoURL,
      },
    })),
  });
}));

export default router; 