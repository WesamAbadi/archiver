import prisma from '../lib/database';
import { v4 as uuidv4 } from 'uuid';

export class AnalyticsService {
  async trackView(mediaItemId: string, userUid?: string, watchDuration?: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      
      // If userUid is provided, find or create the user
      if (userUid) {
        let user = await tx.user.findUnique({
          where: { uid: userUid }
        });
        
        if (!user) {
          // Create user if doesn't exist
          user = await tx.user.create({
            data: {
              uid: userUid,
              email: `${userUid}@temp.example.com`, // Temporary email
              displayName: 'User'
            }
          });
        }
        
        userId = user.id;
      }

      // @ts-ignore
      await tx.view.create({
        data: {
          id: uuidv4(),
          mediaItemId,
          userId, // This will be null if no userUid provided (anonymous view)
          watchDuration: watchDuration || 0
        }
      });

      // @ts-ignore
      await tx.mediaItem.update({
        where: { id: mediaItemId },
        data: { viewCount: { increment: 1 } }
      });
    });
  }

  async getViewStats(mediaItemId: string): Promise<{
    totalViews: number;
    uniqueViewers: number;
    avgWatchDuration: number;
  }> {
    // @ts-ignore
    const views = await prisma.view.findMany({
      where: { mediaItemId }
    });

    const uniqueViewers = new Set(views.filter(v => v.userId).map(v => v.userId)).size;
    const avgWatchDuration = views.reduce((sum, v) => sum + v.watchDuration, 0) / views.length || 0;

    return {
      totalViews: views.length,
      uniqueViewers,
      avgWatchDuration
    };
  }

  async updateEngagementCounts(mediaItemId: string): Promise<void> {
    const [likeCount, commentCount] = await Promise.all([
      prisma.like.count({ where: { mediaItemId } }),
      prisma.comment.count({ where: { mediaItemId } })
    ]);

    // @ts-ignore
    await prisma.mediaItem.update({
      where: { id: mediaItemId },
      data: { likeCount, commentCount }
    });
  }
} 