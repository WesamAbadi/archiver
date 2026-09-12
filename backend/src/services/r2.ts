/**
 * R2 storage service.
 *
 * Two access paths, on purpose:
 * - Presigned URLs (aws4fetch + S3 API tokens): browser uploads/downloads
 *   directly to/from R2 — file bytes never transit the Worker.
 * - R2 binding (`env.MEDIA_BUCKET`): server-side ops (delete, head) — no
 *   credentials needed, runs over the internal service binding.
 *
 * aws4fetch is the right client for Workers (the AWS SDK needs Node APIs).
 * Gotchas baked in below, learned the hard way by many:
 * - sign with `signQuery: true` (query-string auth, not header auth)
 * - do NOT sign Content-Type; let the browser send whatever it sends
 * - the bucket needs a CORS policy allowing PUT/GET from the app origin
 */
import { AwsClient } from 'aws4fetch';
import { createId } from '../lib/id';

export interface R2Env {
  /** R2 bucket binding (server-side ops) */
  MEDIA_BUCKET?: R2Bucket;
  /** S3 API token credentials for presigning */
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** Bucket name as configured in Cloudflare R2 */
  R2_BUCKET_NAME: string;
}

export interface PresignEnv extends R2Env {}

const S3_BASE = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

export function objectKeyFor(userId: string, mediaItemId: string, originalName: string): string {
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.') + 1) : 'bin';
  // Safe ext: alphanumerics only, max 8 chars
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  return `users/${userId}/${mediaItemId}/original.${safeExt}`;
}

/** Content types the app accepts for upload. */
export const ALLOWED_MIME_TYPES = [
  // audio
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
  // video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  // images (thumbnails/album art)
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

// ---------------------------------------------------------------------------
// Presigning
// ---------------------------------------------------------------------------

interface ClientCacheEntry {
  client: AwsClient;
  base: string;
}

const clientCache = new Map<string, ClientCacheEntry>();

function getS3Client(env: PresignEnv): ClientCacheEntry {
  const cacheKey = `${env.R2_ACCOUNT_ID}:${env.R2_ACCESS_KEY_ID}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const entry = { client, base: S3_BASE(env.R2_ACCOUNT_ID) };
  clientCache.set(cacheKey, entry);
  return entry;
}

/**
 * Presigned PUT — the browser uploads directly to R2 with this URL.
 * Deliberately does NOT sign Content-Type (see module docs).
 */
export async function presignedPutUrl(env: PresignEnv, key: string, expiresIn: number): Promise<string> {
  const { client, base } = getS3Client(env);
  const url = `${base}/${env.R2_BUCKET_NAME}/${key}?X-Amz-Expires=${expiresIn}`;
  const signed = await client.sign(new Request(url, { method: 'PUT' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Presigned GET — time-limited read access (private media playback).
 */
export async function presignedGetUrl(env: PresignEnv, key: string, expiresIn: number): Promise<string> {
  const { client, base } = getS3Client(env);
  const url = `${base}/${env.R2_BUCKET_NAME}/${key}?X-Amz-Expires=${expiresIn}`;
  const signed = await client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

// ---------------------------------------------------------------------------
// Server-side ops (via binding — no credentials, no S3 round trip)
// ---------------------------------------------------------------------------

/** Delete an object; returns false if the binding is unavailable or the object never existed. */
export async function deleteObject(env: R2Env, key: string): Promise<boolean> {
  if (!env.MEDIA_BUCKET) return false;
  await env.MEDIA_BUCKET.delete(key);
  return true;
}

export async function objectExists(env: R2Env, key: string): Promise<boolean> {
  if (!env.MEDIA_BUCKET) return false;
  const head = await env.MEDIA_BUCKET.head(key);
  return head !== null;
}

/**
 * Create the key + presigned URL for a new upload.
 * One call so route code stays thin and the key scheme lives in one place.
 */
export async function createUpload(
  env: PresignEnv,
  userId: string,
  originalName: string,
  expiresIn = 900, // 15 min is plenty for a browser PUT
): Promise<{ key: string; uploadUrl: string; mediaItemId: string }> {
  const mediaItemId = createId();
  const key = objectKeyFor(userId, mediaItemId, originalName);
  const uploadUrl = await presignedPutUrl(env, key, expiresIn);
  return { key, uploadUrl, mediaItemId };
}
