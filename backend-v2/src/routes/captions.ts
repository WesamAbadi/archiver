/**
 * Caption routes — read, generate (enqueue), status, edit, delete.
 *
 * Every route is auth-checked and ownership-verified (fixes the old
 * unauthenticated transcript endpoints).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, asc, inArray, desc } from 'drizzle-orm';
import type { AppEnv } from '../env';
import { requireAuth } from '../auth';
import type { DB } from '../db/client';
import { captionJobs, captionSegments, captions, mediaItems } from '../db/schema';
import * as captionService from '../services/captions';
import { backoffSeconds } from '../services/captions';

export const captionRoutes = new Hono<AppEnv>();

captionRoutes.use('*', requireAuth);

/** Verify the media item belongs to the user. */
async function ownedMediaItem(db: DB, mediaItemId: string, userId: string) {
  return db.query.mediaItems.findFirst({
    where: and(eq(mediaItems.id, mediaItemId), eq(mediaItems.userId, userId)),
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

captionRoutes.get('/:mediaItemId/captions', async (c) => {
  const db = c.get('db');
  const admin = c.get('admin');

  const item = await ownedMediaItem(db, c.req.param('mediaItemId'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const rows = await db.query.captions.findMany({
    where: eq(captions.mediaItemId, item.id),
    with: {
      segments: {
        orderBy: (segments, { asc: a }) => [a(segments.startTime)],
      },
    },
  });

  return c.json({ success: true, data: rows });
});

captionRoutes.get('/:mediaItemId/caption-status', async (c) => {
  const db = c.get('db');
  const admin = c.get('admin');

  const item = await ownedMediaItem(db, c.req.param('mediaItemId'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const job = await db.query.captionJobs.findFirst({
    where: and(
      eq(captionJobs.mediaItemId, item.id),
      // most relevant active job first
      inArray(captionJobs.status, ['QUEUED', 'PROCESSING']),
    ),
    orderBy: [desc(captionJobs.createdAt)],
  });

  return c.json({
    success: true,
    data: {
      captionStatus: item.captionStatus,
      errorMessage: item.captionErrorMessage,
      generatedAt: item.captionGeneratedAt,
      job: job
        ? {
            id: job.id,
            status: job.status,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
          }
        : null,
    },
  });
});

// ---------------------------------------------------------------------------
// Generate (enqueue)
// ---------------------------------------------------------------------------

captionRoutes.post('/:mediaItemId/captions/generate', async (c) => {
  const db = c.get('db');
  const admin = c.get('admin');

  const item = await ownedMediaItem(db, c.req.param('mediaItemId'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const result = await captionService.createCaptionJob(db, item.id, admin.id);

  if (typeof result !== 'string') {
    if (result.kind === 'not_found') {
      return c.json({ success: false, error: 'Media file not found' }, 404);
    }
    return c.json(
      { success: false, error: `Transcription not available for ${result.mimeType}` },
      415,
    );
  }

  // Send to the queue. The DB row is the source of truth; if the send fails
  // the cron sweep will re-send QUEUED jobs, so we don't fail the request.
  const queue = c.env.CAPTION_QUEUE;
  if (queue) {
    await queue.send({
      version: 1,
      jobId: result,
      mediaItemId: item.id,
      userUid: admin.uid,
    });
  } else {
    console.warn('[captions] CAPTION_QUEUE binding missing; job will be picked up by cron');
  }

  const job = await db.query.captionJobs.findFirst({ where: eq(captionJobs.id, result) });

  return c.json({
    success: true,
    data: {
      jobId: result,
      status: job?.status ?? 'QUEUED',
      estimatedDelaySeconds: job ? backoffSeconds(job.attempts) : 0,
    },
  });
});

// ---------------------------------------------------------------------------
// Edit segments
// ---------------------------------------------------------------------------

const segmentUpsertSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().optional(),
        startTime: z.number().min(0),
        endTime: z.number().min(0),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(5000),
});

/** Replace all segments of the item's auto caption (bulk save from the editor). */
captionRoutes.put('/:mediaItemId/captions/:captionId', async (c) => {
  const db = c.get('db');
  const admin = c.get('admin');

  const item = await ownedMediaItem(db, c.req.param('mediaItemId'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const caption = await db.query.captions.findFirst({
    where: and(eq(captions.id, c.req.param('captionId')), eq(captions.mediaItemId, item.id)),
  });
  if (!caption) return c.json({ success: false, error: 'Caption not found' }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = segmentUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid segments payload' }, 400);
  }

  // Validate temporal sanity before writing
  for (const s of parsed.data.segments) {
    if (s.endTime <= s.startTime) {
      return c.json({ success: false, error: 'Segment endTime must be after startTime' }, 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(captionSegments).where(eq(captionSegments.captionId, caption.id));
    await tx.insert(captionSegments).values(
      parsed.data.segments.map((s) => ({
        id: s.id ?? createSegmentId(),
        captionId: caption.id,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
      })),
    );
    await tx
      .update(captions)
      .set({ updatedAt: new Date(), isAutoGenerated: false })
      .where(eq(captions.id, caption.id));
  });

  const segments = await db
    .select()
    .from(captionSegments)
    .where(eq(captionSegments.captionId, caption.id))
    .orderBy(asc(captionSegments.startTime));

  return c.json({ success: true, data: { ...caption, isAutoGenerated: false, segments } });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

captionRoutes.delete('/:mediaItemId/captions/:captionId', async (c) => {
  const db = c.get('db');
  const admin = c.get('admin');

  const item = await ownedMediaItem(db, c.req.param('mediaItemId'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const caption = await db.query.captions.findFirst({
    where: and(eq(captions.id, c.req.param('captionId')), eq(captions.mediaItemId, item.id)),
  });
  if (!caption) return c.json({ success: false, error: 'Caption not found' }, 404);

  await db.delete(captions).where(eq(captions.id, caption.id));
  await db
    .update(mediaItems)
    .set({ captionStatus: 'PENDING', captionErrorMessage: null, captionGeneratedAt: null, updatedAt: new Date() })
    .where(eq(mediaItems.id, item.id));

  return c.json({ success: true });
});

function createSegmentId(): string {
  // local helper keeps the import surface small
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}
