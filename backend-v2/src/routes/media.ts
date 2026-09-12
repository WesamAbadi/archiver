/**
 * Media routes — archive CRUD + presigned upload lifecycle.
 *
 * Single admin: every route requires a session and every query is still scoped
 * to the admin's owner id (defensive — ownership stays a real constraint, not
 * an assumption, if a second owner ever appears).
 *
 * Upload flow (nothing big transits the Worker):
 *   1. POST /media/upload/start    -> { mediaItemId, uploadUrl, key }
 *   2. browser PUTs file to uploadUrl (R2 directly, with progress events)
 *   3. POST /media/upload/confirm  -> verifies object exists, records file
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAuth } from '../auth';
import * as mediaService from '../services/media';
import * as captionService from '../services/captions';
import { getStorageQuota } from '../services/users';
import { isAllowedMimeType } from '../services/r2';

export const mediaRoutes = new Hono<AppEnv>();

mediaRoutes.use('*', requireAuth);

// ---------------------------------------------------------------------------
// List / get / update / delete
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

mediaRoutes.get('/', async (c) => {
  const admin = c.get('admin');

  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ success: false, error: 'Invalid query parameters' }, 400);
  }

  const result = await mediaService.listUserMedia(c.get('db'), admin.id, query.data);
  return c.json({ success: true, data: result.items, pagination: { ...result } });
});

mediaRoutes.get('/quota', async (c) => {
  const admin = c.get('admin');
  const quota = await getStorageQuota(c.get('db'), admin.id);
  return c.json({ success: true, data: quota });
});

mediaRoutes.get('/:id', async (c) => {
  const admin = c.get('admin');
  const item = await mediaService.getMediaItem(c.get('db'), c.req.param('id'), admin.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  return c.json({ success: true, data: item });
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

mediaRoutes.patch('/:id', async (c) => {
  const admin = c.get('admin');

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid update payload' }, 400);
  }

  const updated = await mediaService.updateMediaItem(
    c.get('db'),
    c.req.param('id'),
    admin.id,
    parsed.data,
  );
  if (!updated) return c.json({ success: false, error: 'Media item not found' }, 404);

  return c.json({ success: true, data: updated });
});

mediaRoutes.delete('/:id', async (c) => {
  const admin = c.get('admin');

  const deleted = await mediaService.deleteMediaItem(
    c.get('db'),
    c.env,
    c.req.param('id'),
    admin.id,
  );
  if (!deleted) return c.json({ success: false, error: 'Media item not found' }, 404);

  return c.json({ success: true, message: 'Media item deleted' });
});

// ---------------------------------------------------------------------------
// Upload lifecycle (presigned direct-to-R2)
// ---------------------------------------------------------------------------

const uploadStartSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});

mediaRoutes.post('/upload/start', async (c) => {
  const admin = c.get('admin');

  const body = await c.req.json().catch(() => null);
  const parsed = uploadStartSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Invalid upload request', details: parsed.error.flatten() },
      400,
    );
  }
  const input = parsed.data;

  if (!isAllowedMimeType(input.mimeType)) {
    return c.json({ success: false, error: `Unsupported file type: ${input.mimeType}` }, 415);
  }

  const result = await mediaService.startUpload(c.get('db'), c.env, admin.id, input);
  if ('kind' in result) {
    if (result.kind === 'quota') {
      return c.json(
        {
          success: false,
          error: 'Storage limit reached',
          data: { used: result.used, limit: result.limit },
        },
        413,
      );
    }
    return c.json({ success: false, error: 'Unsupported file type' }, 415);
  }

  return c.json({
    success: true,
    data: {
      mediaItemId: result.mediaItemId,
      key: result.key,
      uploadUrl: result.uploadUrl,
    },
  });
});

const uploadConfirmSchema = z.object({
  mediaItemId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().min(1),
});

mediaRoutes.post('/upload/confirm', async (c) => {
  const admin = c.get('admin');

  const body = await c.req.json().catch(() => null);
  const parsed = uploadConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid confirm payload' }, 400);
  }

  const result = await mediaService.confirmUpload(
    c.get('db'),
    c.env,
    admin.id,
    parsed.data.mediaItemId,
    {
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    },
  );

  if (!result.ok) {
    switch (result.error.kind) {
      case 'not_found':
        return c.json({ success: false, error: 'Media item not found' }, 404);
      case 'not_uploaded':
        return c.json(
          { success: false, error: 'File not found in storage — upload did not complete' },
          409,
        );
      case 'quota':
        return c.json({ success: false, error: 'Storage limit exceeded' }, 413);
    }
  }

  // Auto-enqueue transcription for audio (video later). Never fails the upload:
  // job row is QUEUED and the cron sweep re-sends if the queue send throws.
  let captionJobId: string | null = null;
  try {
    const enqueued = await captionService.createCaptionJob(c.get('db'), result.item.id, admin.id);
    if (typeof enqueued === 'string') {
      captionJobId = enqueued;
      await c.env.CAPTION_QUEUE?.send({
        version: 1,
        jobId: enqueued,
        mediaItemId: result.item.id,
        userUid: admin.uid,
      });
    }
  } catch (err) {
    console.error('[upload/confirm] caption enqueue failed (cron will retry):', err);
  }

  return c.json({ success: true, data: { ...result.item, captionJobId } });
});

// Route-order note: static paths (/upload/start, /quota) are registered above
// the `/:id` handler. Hono matches in registration order, so the old Express
// app's unreachable-route bug (popular-tags after /:id) can't recur here.
