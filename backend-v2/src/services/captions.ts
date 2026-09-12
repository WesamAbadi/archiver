/**
 * Caption service — job lifecycle + transcription persistence.
 *
 * Job state machine (kept from the old app's semantics, execution moved to
 * Cloudflare Queues — no more setInterval-in-a-constructor disasters):
 *
 *   PENDING ──enqueue──> QUEUED ──claim──> PROCESSING ──> COMPLETED
 *                             ^                │
 *                             └── retry ───────┴──> FAILED (attempts >= max)
 *
 * Invariants that fix old-code bugs:
 * - Attempt counting and max-attempt decisions live in the DB (survive
 *   restarts; the old in-memory counters reset on deploy).
 * - Stuck PROCESSING jobs are reclaimed by cron (old code left them forever).
 * - Queue retries are driven by msg.retry({delaySeconds}) with exponential
 *   backoff; job.attempts tracks failures, not deliveries.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import {
  captionJobs,
  captionSegments,
  captions,
  mediaFiles,
  mediaItems,
  type CaptionJobStatus,
} from '../db/schema';
import { createId } from '../lib/id';
import type { GroqVerboseResponse } from './groq';

export const MAX_ATTEMPTS = 3;
/** Jobs older than this in PROCESSING are considered stuck. */
export const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

/** Exponential backoff for queue retries: 1min, 4min, 9min... capped at 1h. */
export function backoffSeconds(attempt: number): number {
  return Math.min(attempt * attempt * 60, 3600);
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export type EnqueueError = { kind: 'not_found' } | { kind: 'unsupported_type'; mimeType: string };

const TRANSCRIBABLE_MIME = /^audio\//i;

/**
 * Audio only in v1 (Whisper input). Video containers can be added later once
 * we have an audio-extraction step; images are SKIPPED, matching old behavior.
 */
export function isTranscribable(mimeType: string): boolean {
  return TRANSCRIBABLE_MIME.test(mimeType);
}

/**
 * Mark the media item ready for transcription. The Queues message is sent by
 * the caller (route/consumer) — this only does the DB side.
 */
export async function createCaptionJob(
  db: DB,
  mediaItemId: string,
  userId: string,
): Promise<string | EnqueueError> {
  const item = await db.query.mediaItems.findFirst({
    where: eq(mediaItems.id, mediaItemId),
  });
  if (!item || item.userId !== userId) return { kind: 'not_found' };

  const file = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.mediaItemId, mediaItemId),
  });
  if (!file) return { kind: 'not_found' };

  if (!isTranscribable(file.mimeType)) {
    await db
      .update(mediaItems)
      .set({ captionStatus: 'SKIPPED', updatedAt: new Date() })
      .where(eq(mediaItems.id, mediaItemId));
    return { kind: 'unsupported_type', mimeType: file.mimeType };
  }

  // Idempotent: reuse an active job instead of duplicating (old code raced here)
  const active = await db.query.captionJobs.findFirst({
    where: and(
      eq(captionJobs.mediaItemId, mediaItemId),
      sql`${captionJobs.status} IN ('QUEUED', 'PROCESSING')`,
    ),
  });
  if (active) return active.id;

  const jobId = createId();
  await db.transaction(async (tx) => {
    await tx.insert(captionJobs).values({
      id: jobId,
      userId,
      mediaItemId,
      status: 'QUEUED',
      maxAttempts: MAX_ATTEMPTS,
    });
    await tx
      .update(mediaItems)
      .set({ captionStatus: 'QUEUED', captionErrorMessage: null, updatedAt: new Date() })
      .where(eq(mediaItems.id, mediaItemId));
  });

  return jobId;
}

// ---------------------------------------------------------------------------
// Claim / complete / fail
// ---------------------------------------------------------------------------

export interface ClaimedJob {
  jobId: string;
  mediaItemId: string;
  userId: string;
  objectKey: string;
  language?: string;
}

/**
 * Atomically claim a job: only succeeds if it's still QUEUED, and stamps
 * processing metadata. Prevents double-processing on at-least-once redelivery.
 */
export async function claimJob(
  db: DB,
  jobId: string,
): Promise<ClaimedJob | null> {
  const now = new Date();
  const updated = await db
    .update(captionJobs)
    .set({ status: 'PROCESSING', processingStartedAt: now, updatedAt: now })
    .where(and(eq(captionJobs.id, jobId), eq(captionJobs.status, 'QUEUED')))
    .returning({ id: captionJobs.id, mediaItemId: captionJobs.mediaItemId, userId: captionJobs.userId });

  const job = updated[0];
  if (!job) return null; // already claimed/processed/cancelled

  const file = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.mediaItemId, job.mediaItemId),
  });
  if (!file) {
    await failJob(db, jobId, job.mediaItemId, 'Media file record missing');
    return null;
  }

  await db
    .update(mediaItems)
    .set({ captionStatus: 'PROCESSING', updatedAt: now })
    .where(eq(mediaItems.id, job.mediaItemId));

  return {
    jobId: job.id,
    mediaItemId: job.mediaItemId,
    userId: job.userId,
    objectKey: file.filename,
    language: undefined,
  };
}

/** Persist Whisper output: one caption row + its segments. Replaces prior auto captions. */
export async function saveTranscription(
  db: DB,
  mediaItemId: string,
  result: GroqVerboseResponse,
): Promise<number> {
  const segments = normalizeSegments(result.segments ?? []);
  const language = result.language && result.language !== '' ? result.language : 'auto';

  // Replace any previous auto-generated caption for this item
  await db.delete(captions).where(
    and(eq(captions.mediaItemId, mediaItemId), eq(captions.isAutoGenerated, true)),
  );

  const captionId = createId();
  await db.insert(captions).values({
    id: captionId,
    mediaItemId,
    language,
    isAutoGenerated: true,
  });

  if (segments.length > 0) {
    await db.insert(captionSegments).values(
      segments.map((s) => ({
        id: createId(),
        captionId,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: s.confidence ?? null,
      })),
    );
  }

  return segments.length;
}

export async function completeJob(
  db: DB,
  jobId: string,
  mediaItemId: string,
  segmentCount: number,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(captionJobs)
      .set({ status: 'COMPLETED', completedAt: now, updatedAt: now, errorMessage: null })
      .where(eq(captionJobs.id, jobId));
    await tx
      .update(mediaItems)
      .set({
        captionStatus: 'COMPLETED',
        captionErrorMessage: null,
        captionGeneratedAt: now,
        updatedAt: now,
      })
      .where(eq(mediaItems.id, mediaItemId));
  });
  console.log(`[captions] job ${jobId}: completed with ${segmentCount} segments`);
}

export async function failJob(
  db: DB,
  jobId: string,
  mediaItemId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(captionJobs)
      .set({ status: 'FAILED', completedAt: now, updatedAt: now, errorMessage })
      .where(eq(captionJobs.id, jobId));
    await tx
      .update(mediaItems)
      .set({ captionStatus: 'FAILED', captionErrorMessage: errorMessage, updatedAt: now })
      .where(eq(mediaItems.id, mediaItemId));
  });
}

/**
 * Record a failure and decide retryability. Returns the backoff delay when
 * the job should be retried, or null when attempts are exhausted.
 */
export async function recordFailure(
  db: DB,
  jobId: string,
  mediaItemId: string,
  errorMessage: string,
): Promise<{ retry: true; delaySeconds: number } | { retry: false } | null> {
  // Job may not exist (message from a previous deploy) — nothing to update
  const job = await db.query.captionJobs.findFirst({ where: eq(captionJobs.id, jobId) });
  if (!job) return null;

  const attempts = job.attempts + 1;
  const now = new Date();

  if (attempts >= job.maxAttempts) {
    await failJob(db, jobId, mediaItemId, errorMessage);
    return { retry: false };
  }

  await db
    .update(captionJobs)
    .set({
      status: 'QUEUED',
      attempts,
      errorMessage,
      processingStartedAt: null,
      updatedAt: now,
    })
    .where(eq(captionJobs.id, jobId));

  await db
    .update(mediaItems)
    .set({ captionStatus: 'QUEUED', captionErrorMessage: errorMessage, updatedAt: now })
    .where(eq(mediaItems.id, mediaItemId));

  return { retry: true, delaySeconds: backoffSeconds(attempts) };
}

// ---------------------------------------------------------------------------
// Stuck-job reclaim (cron)
// ---------------------------------------------------------------------------

/**
 * Reset jobs stuck in PROCESSING back to QUEUED. The cron handler re-sends
 * QUEUED jobs to the queue afterwards. Returns reclaimed job ids.
 */
export async function reclaimStuckJobs(db: DB): Promise<string[]> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const reclaimed = await db
    .update(captionJobs)
    .set({ status: 'QUEUED', processingStartedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(captionJobs.status, 'PROCESSING'),
        lt(captionJobs.processingStartedAt, cutoff),
      ),
    )
    .returning({ id: captionJobs.id });

  if (reclaimed.length > 0) {
    console.log(`[captions] reclaimed ${reclaimed.length} stuck job(s)`);
  }
  return reclaimed.map((r) => r.id);
}

/** Jobs currently QUEUED (for cron re-send — covers dropped messages). */
export async function listQueuedJobIds(db: DB, limit = 100): Promise<string[]> {
  const rows = await db
    .select({ id: captionJobs.id })
    .from(captionJobs)
    .where(eq(captionJobs.status, 'QUEUED'))
    .orderBy(captionJobs.createdAt)
    .limit(limit);
  return rows.map((r) => r.id);
}

export function jobStatusCounts(statuses: { status: CaptionJobStatus }[]): Record<string, number> {
  return statuses.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Segment normalization
// ---------------------------------------------------------------------------

export interface NormalizedSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

/**
 * Sanity-pass Whisper segments: drop empties, enforce ordering/positivity.
 * Whisper timestamps are real — this is a light guardrail, not the old
 * 100-line hallucination-repair heuristics.
 */
export function normalizeSegments(segments: GroqVerboseResponse['segments']): NormalizedSegment[] {
  if (!Array.isArray(segments)) return [];

  const out: NormalizedSegment[] = [];
  let lastEnd = 0;

  for (const seg of segments) {
    if (!seg || typeof seg.text !== 'string' || !seg.text.trim()) continue;

    let start = Number(seg.start);
    let end = Number(seg.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0) start = 0;
    if (start < lastEnd) start = lastEnd;
    if (end <= start) end = start + 0.5;

    out.push({
      startTime: Number(start.toFixed(3)),
      endTime: Number(end.toFixed(3)),
      text: seg.text.trim(),
      confidence: typeof seg.no_speech_prob === 'number' ? 1 - seg.no_speech_prob : undefined,
    });

    lastEnd = end;
  }

  return out;
}
