/**
 * Media routes — public reading, admin-only changing.
 *
 * The archive is public, so browsing it (list, one item, playback URL) needs no
 * session, and `optionalAuth` identifies the admin when one is present so the
 * same handler can return management detail to them alone.
 *
 * Every route that *changes* the archive is still admin-only, and says so with
 * its own `requireAuth` rather than inheriting a blanket guard. There is
 * deliberately no `use('*', …)` here: adding a route should require deciding
 * who it is for, not silently joining whichever group the file defaults to.
 *
 * Upload flow (nothing big transits the Worker):
 *   1. POST /media/upload/start    -> { mediaItemId, uploadUrl, key }
 *   2. browser PUTs file to uploadUrl (R2 directly, with progress events)
 *   3. POST /media/upload/confirm  -> verifies object exists, records file
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { getAdmin, optionalAuth, requireAuth } from '../auth';
import * as mediaService from '../services/media';
import { toPublicMediaItem } from '../services/media';

import * as captionService from '../services/captions';
import { getStorageQuota } from '../services/users';
import { isAllowedMimeType, presignedGetUrl } from '../services/r2';

export const mediaRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// List / get / update / delete
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// PUBLIC — anyone may browse the archive.
mediaRoutes.get('/', optionalAuth, async (c) => {
  const admin = getAdmin(c);

  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ success: false, error: 'Invalid query parameters' }, 400);
  }

  const { items, ...pagination } = await mediaService.listUserMedia(
    c.get('db'),
    admin?.id,
    query.data,
  );

  return c.json({
    success: true,
    data: admin ? items : items.map(toPublicMediaItem),
    // `items` is the payload; the envelope's pagination is counts only.
    pagination,
  });
});

// ADMIN — storage usage is a management number, not archive content.
mediaRoutes.get('/quota', requireAuth, async (c) => {
  const admin = c.get('admin');
  const quota = await getStorageQuota(c.get('db'), admin.id);
  return c.json({ success: true, data: quota });
});

// PUBLIC — one item. Registered after /quota so the static path wins.
mediaRoutes.get('/:id', optionalAuth, async (c) => {
  const admin = getAdmin(c);
  const item = await mediaService.getMediaItem(c.get('db'), c.req.param('id'), admin?.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  return c.json({ success: true, data: admin ? item : toPublicMediaItem(item) });
});

// ---------------------------------------------------------------------------
// Playback: short-lived presigned GET for a stored file
// ---------------------------------------------------------------------------

/** 6 hours — comfortably longer than a long track, short enough to be safe. */
const PLAYBACK_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Presigned GET for one file of one media item.
 *
 * The bucket is private, so the raw key in `files[].filename` is NOT playable.
 * Playback URLs are short-lived and issued here rather than returned in list
 * responses — embedding them in `/media` would mean N signatures per page load
 * and URLs that expire while the page sits open.
 */
// PUBLIC — playback. The bucket stays private; this hands out a short-lived
// signed URL for one item, which is what makes the archive watchable at all.
mediaRoutes.get('/:id/files/:fileId/url', optionalAuth, async (c) => {
  const admin = getAdmin(c);

  const item = await mediaService.getMediaItem(c.get('db'), c.req.param('id'), admin?.id);
  if (!item) return c.json({ success: false, error: 'Media item not found' }, 404);

  const file = item.files.find((f) => f.id === c.req.param('fileId'));
  if (!file) return c.json({ success: false, error: 'File not found' }, 404);

  const expiresAt = new Date(Date.now() + PLAYBACK_URL_TTL_SECONDS * 1000);
  const url = await presignedGetUrl(c.env, file.filename, PLAYBACK_URL_TTL_SECONDS);

  return c.json({ success: true, data: { url, expiresAt: expiresAt.toISOString() } });
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

mediaRoutes.patch('/:id', requireAuth, async (c) => {
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

mediaRoutes.delete('/:id', requireAuth, async (c) => {
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

mediaRoutes.post('/upload/start', requireAuth, async (c) => {
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
  /**
   * Seconds, measured in the browser — the API never sees the bytes, so this is
   * the only place the value can come from. Null/absent when the browser can't
   * decode the file (images, exotic formats); never fails the upload over it.
   */
  duration: z.number().int().min(0).max(86_400).nullable().optional(),
});

mediaRoutes.post('/upload/confirm', requireAuth, async (c) => {
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
      duration: parsed.data.duration ?? null,
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
