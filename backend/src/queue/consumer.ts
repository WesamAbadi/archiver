/**
 * Queue consumer + cron handlers.
 *
 * queue(): per-message ack/retry so one bad job never re-delivers a whole
 * batch (explicit ack semantics — see Queues docs). Provider 'transient' errors
 * -> msg.retry({delaySeconds}) with exponential backoff; 'permanent' errors
 * -> recorded failure (job FAILED after attempts), message acked.
 *
 * Which provider runs is a setting, read once per batch (see services/settings),
 * so changing it in the UI affects the next job rather than requiring a deploy.
 * A file already mid-retry keeps whatever it gets on its next attempt — jobs
 * store no provider, deliberately: there is one current answer, not a history.
 *
 * scheduled(): two cron duties, kept cheap:
 * - reclaim stuck PROCESSING jobs back to QUEUED
 * - re-send QUEUED jobs to the queue (covers reclaim + any dropped messages)
 */
import type { Env } from '../env';
import type { CaptionJobMessage } from './messages';
import { captionJobMessageSchema } from './messages';
import { createDB, type DB } from '../db/client';
import * as captionService from '../services/captions';
import { getAppSettings, type ResolvedAppSettings } from '../services/settings';
import { transcribe, TranscriptionError } from '../services/transcription';

export async function handleQueueBatch(
  batch: MessageBatch<CaptionJobMessage>,
  env: Env,
): Promise<void> {
  const db = await createDB(env);

  // One read for the whole batch. Failing here (rather than per job) is
  // deliberate: we cannot pick a provider, so nothing in this batch can run.
  const settings = await getAppSettings(db);

  for (const message of batch.messages) {
    const parsed = captionJobMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      // Malformed message can never succeed — ack it so it doesn't burn retries.
      console.error('[queue] malformed message, acking:', parsed.error.message);
      message.ack();
      continue;
    }
    const msg = parsed.data;

    try {
      await processJob(db, env, msg, settings);
      message.ack();
    } catch (err) {
      // Name the provider in the recorded message: "transcription failed" after
      // switching providers is ambiguous exactly when it matters most.
      const errorMessage =
        err instanceof TranscriptionError
          ? `[${err.provider}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`[queue] job ${msg.jobId} failed:`, errorMessage);

      const outcome = await captionService
        .recordFailure(db, msg.jobId, msg.mediaItemId, errorMessage)
        .catch((dbErr) => {
          console.error('[queue] recordFailure failed:', dbErr);
          return null;
        });

      if (outcome === null) {
        // DB itself failed — let Queues redeliver the whole message.
        message.retry();
        continue;
      }

      if (outcome.retry) {
        // Transient failure (or attempts remaining): negative-ack with backoff.
        // recordFailure already flipped the job back to QUEUED.
        message.retry({ delaySeconds: outcome.delaySeconds });
      } else {
        // Permanently failed after max attempts — stop redelivering.
        message.ack();
      }
    }
  }
}

async function processJob(
  db: DB,
  env: Env,
  msg: CaptionJobMessage,
  settings: ResolvedAppSettings,
): Promise<void> {
  const claimed = await captionService.claimJob(db, msg.jobId);
  if (!claimed) {
    // Not claimable (already processed / cancelled / unknown) — done, ack.
    console.log(`[queue] job ${msg.jobId} not claimable; skipping`);
    return;
  }

  // The dispatcher owns provider specifics: Groq gets a fresh presigned URL
  // (never a stale one), Google gets the bytes out of R2.
  const result = await transcribe(
    env,
    { provider: settings.provider, model: settings.model },
    {
      objectKey: claimed.objectKey,
      mimeType: claimed.mimeType,
      size: claimed.size,
      language: claimed.language,
    },
  );

  const segmentCount = await captionService.saveTranscription(db, claimed.mediaItemId, result);
  await captionService.completeJob(db, claimed.jobId, claimed.mediaItemId, segmentCount);
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export async function handleScheduled(
  _event: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const db = await createDB(env);

  // 1. Reclaim stuck PROCESSING jobs (Worker crashed mid-job, etc.)
  await captionService.reclaimStuckJobs(db);

  // 2. Re-send QUEUED jobs to the queue. Idempotent with claimJob: redelivery
  //    of a completed job just no-ops ("not claimable").
  const queuedIds = await captionService.listQueuedJobIds(db);
  if (queuedIds.length === 0) return;

  const queue = env.CAPTION_QUEUE;
  if (!queue) {
    console.error('[cron] CAPTION_QUEUE binding missing; cannot re-send jobs');
    return;
  }

  // Fetch the user uids for the messages (required by the message schema).
  const messages: CaptionJobMessage[] = [];
  for (const jobId of queuedIds) {
    const job = await db.query.captionJobs.findFirst({
      where: (jobs, { eq }) => eq(jobs.id, jobId),
      columns: { id: true, mediaItemId: true, userId: true },
    });
    if (!job) continue;

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, job.userId),
      columns: { uid: true },
    });
    if (!user) continue;

    messages.push({ version: 1, jobId: job.id, mediaItemId: job.mediaItemId, userUid: user.uid });
  }

  if (messages.length > 0) {
    await queue.sendBatch(messages.map((body) => ({ body })));
    console.log(`[cron] re-sent ${messages.length} QUEUED job(s) to the caption queue`);
  }
}
