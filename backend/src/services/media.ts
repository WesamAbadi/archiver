/**
 * Media service — CRUD + upload lifecycle.
 *
 * Fixes carried over from the old codebase (MIGRATION_PLAN.md §3.2):
 * - Upload confirmation verifies the object actually landed in R2 (head) before
 *   recording it, and quota is re-checked at confirm time using the real size.
 * - Ownership is enforced in every query (`userId` in the WHERE clause), not
 *   trusted from the client.
 * - One serialization function for API responses, not six.
 */
import { and, eq, desc, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { mediaItems, mediaFiles, type MediaItem } from '../db/schema';
import { createId } from '../lib/id';
import {
  objectExists,
  objectKeyFor,
  presignedPutUrl,
  deleteObject,
  type R2Env,
} from './r2';
import { getStorageQuota, STORAGE_LIMIT_BYTES } from './users';

// ---------------------------------------------------------------------------
// Serialization — the single place API responses are shaped (no BigInt leaks)
// ---------------------------------------------------------------------------

export interface MediaItemDTO extends Omit<MediaItem, 'size'> {
  size: number;
  files: MediaFileDTO[];
}

export interface MediaFileDTO extends Omit<typeof mediaFiles.$inferSelect, 'size'> {
  size: number;
}

function serializeFile(file: typeof mediaFiles.$inferSelect): MediaFileDTO {
  return { ...file, size: Number(file.size) };
}

export function serializeMediaItem(
  item: MediaItem,
  files: (typeof mediaFiles.$inferSelect)[],
): MediaItemDTO {
  return {
    ...item,
    size: Number(item.size),
    files: files.map(serializeFile),
  };
}

/**
 * A media item as a visitor sees it.
 *
 * `captionErrorMessage` holds whatever the provider returned — capped error
 * bodies, model ids, file sizes. It is what the admin needs to debug a failed
 * job, and noise at best, internal detail at worst, for everyone else. Narrowing
 * the public surface happens here, in one greppable place, rather than by hand
 * at every read route that might forget.
 */
export function toPublicMediaItem(item: MediaItemDTO): MediaItemDTO {
  return item.captionErrorMessage === null ? item : { ...item, captionErrorMessage: null };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface FileRow {
  media_files: typeof mediaFiles.$inferSelect | null;
}

function groupByItem(rows: FileRow[]): Map<string, (typeof mediaFiles.$inferSelect)[]> {
  const map = new Map<string, (typeof mediaFiles.$inferSelect)[]>();
  for (const row of rows) {
    const f = row.media_files;
    if (!f) continue;
    const list = map.get(f.mediaItemId) ?? [];
    list.push(f);
    map.set(f.mediaItemId, list);
  }
  return map;
}

/**
 * List media items, newest first.
 *
 * `userId` is optional: omitted means "no owner filter", which is what the
 * public archive uses. There is one owner today, so the two are the same rows —
 * but the filter is a real constraint where it is given, not an assumption, so
 * the admin routes keep passing it and the public ones simply don't.
 */
export async function listUserMedia(
  db: DB,
  userId?: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ items: MediaItemDTO[]; page: number; limit: number; total: number; totalPages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const where = userId ? eq(mediaItems.userId, userId) : undefined;

  const [items, [countRow], fileRows] = await Promise.all([
    db.select().from(mediaItems).where(where).orderBy(desc(mediaItems.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`COUNT(*)::bigint` }).from(mediaItems).where(where),
    db
      .select({ media_files: mediaFiles })
      .from(mediaFiles)
      .innerJoin(mediaItems, eq(mediaFiles.mediaItemId, mediaItems.id))
      .where(where),
  ]);

  const filesByItem = groupByItem(fileRows);

  return {
    items: items.map((item) => serializeMediaItem(item, filesByItem.get(item.id) ?? [])),
    page,
    limit,
    total: Number(countRow?.count ?? 0),
    totalPages: Math.ceil(Number(countRow?.count ?? 0) / limit),
  };
}

/** One item, optionally constrained to an owner. Omitted `userId` = public read. */
export async function getMediaItem(
  db: DB,
  id: string,
  userId?: string,
): Promise<MediaItemDTO | null> {
  const item = await db.query.mediaItems.findFirst({
    where: userId
      ? and(eq(mediaItems.id, id), eq(mediaItems.userId, userId))
      : eq(mediaItems.id, id),
  });
  if (!item) return null;

  const files = await db.select().from(mediaFiles).where(eq(mediaFiles.mediaItemId, item.id));
  return serializeMediaItem(item, files);
}

export interface UpdateMediaInput {
  title?: string;
  description?: string | null;
  tags?: string[];
}

export async function updateMediaItem(
  db: DB,
  id: string,
  userId: string,
  updates: UpdateMediaInput,
): Promise<MediaItemDTO | null> {
  const [updated] = await db
    .update(mediaItems)
    .set({
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      updatedAt: new Date(),
    })
    .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
    .returning();

  if (!updated) return null;

  const files = await db.select().from(mediaFiles).where(eq(mediaFiles.mediaItemId, updated.id));
  return serializeMediaItem(updated, files);
}

export async function deleteMediaItem(db: DB, env: R2Env, id: string, userId: string): Promise<boolean> {
  // Collect R2 keys first so storage cleanup survives the cascade delete
  const files = await db
    .select({ key: mediaFiles.filename })
    .from(mediaFiles)
    .innerJoin(mediaItems, eq(mediaFiles.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)));

  const deleted = await db
    .delete(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
    .returning({ id: mediaItems.id });

  if (deleted.length === 0) return false;

  // Best-effort R2 cleanup (mirrors old behavior: never fail the request on storage delete)
  await Promise.all(files.map((f) => deleteObject(env, f.key).catch(() => false)));

  return true;
}

// ---------------------------------------------------------------------------
// Upload lifecycle
// ---------------------------------------------------------------------------

export interface CreateUploadResult {
  mediaItemId: string;
  key: string;
  uploadUrl: string;
}

export type UploadStartError =
  | { kind: 'quota'; used: number; limit: number }
  | { kind: 'mime'; mime: string };

/**
 * Start an upload: quota check FIRST (fixes old check-after-upload bug),
 * then create the media row + presigned PUT.
 */
export async function startUpload(
  db: DB,
  env: R2Env,
  userId: string,
  input: { filename: string; mimeType: string; size: number; title: string; tags: string[]; description?: string },
): Promise<CreateUploadResult | UploadStartError> {
  const quota = await getStorageQuota(db, userId);
  if (!quota.hasSpace) {
    return { kind: 'quota', used: quota.used, limit: quota.limit };
  }

  const mediaItemId = createId();
  const key = objectKeyFor(userId, mediaItemId, input.filename);

  const inserted = await db
    .insert(mediaItems)
    .values({
      id: mediaItemId,
      userId,
      originalUrl: 'direct-upload',
      platform: 'DIRECT',
      title: input.title,
      description: input.description,
      tags: input.tags,
      size: input.size,
      format: input.filename.includes('.') ? input.filename.split('.').pop()!.toLowerCase().slice(0, 32) : '',
      // captionStatus stays PENDING; queued in Phase 2 after confirm
    })
    .returning({ id: mediaItems.id });

  const createdId = inserted[0]?.id;
  if (!createdId) throw new Error('Failed to create media item');

  const uploadUrl = await presignedPutUrl(env, key, 900);

  return { mediaItemId: createdId, key, uploadUrl };
}

export type ConfirmError = { kind: 'not_found' } | { kind: 'not_uploaded' } | { kind: 'quota'; used: number; limit: number };

/**
 * Confirm an upload: verify the object exists in R2, record the file row,
 * re-check quota with the real uploaded size.
 */
export async function confirmUpload(
  db: DB,
  env: R2Env,
  userId: string,
  mediaItemId: string,
  input: { filename: string; mimeType: string; size: number; duration: number | null },
): Promise<{ ok: true; item: MediaItemDTO } | { ok: false; error: ConfirmError }> {
  const item = await db.query.mediaItems.findFirst({
    where: and(eq(mediaItems.id, mediaItemId), eq(mediaItems.userId, userId)),
  });
  if (!item) return { ok: false, error: { kind: 'not_found' } };

  const key = objectKeyFor(userId, mediaItemId, input.filename);
  const exists = await objectExists(env, key);
  if (!exists) return { ok: false, error: { kind: 'not_uploaded' } };

  // Real size from the browser; re-check quota at confirm time
  const quota = await getStorageQuota(db, userId);
  if (quota.used + input.size > quota.limit) {
    // Clean up: remove the R2 object we can't keep
    await deleteObject(env, key).catch(() => false);
    return { ok: false, error: { kind: 'quota', used: quota.used, limit: quota.limit } };
  }

  await db.insert(mediaFiles).values({
    id: createId(),
    mediaItemId: item.id,
    filename: key,
    originalName: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    isOriginal: true,
    format: input.filename.includes('.') ? input.filename.split('.').pop()!.toLowerCase().slice(0, 32) : '',
  });

  await db
    .update(mediaItems)
    .set({ size: input.size, duration: input.duration, updatedAt: new Date() })
    .where(eq(mediaItems.id, item.id));

  const files = await db.select().from(mediaFiles).where(eq(mediaFiles.mediaItemId, item.id));
  return { ok: true, item: serializeMediaItem(item, files) };
}

export { STORAGE_LIMIT_BYTES };
