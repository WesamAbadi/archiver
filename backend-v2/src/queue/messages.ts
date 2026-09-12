import { z } from 'zod';

/**
 * Message contract for the caption-queue. Versioned so old messages left in
 * a queue across deploys are handled (or dead-lettered) predictably.
 */
export const captionJobMessageSchema = z.object({
  version: z.literal(1),
  jobId: z.string().min(1),
  mediaItemId: z.string().min(1),
  /** OAuth uid of the job owner (for logging/authorization in consumers) */
  userUid: z.string().min(1),
});

export type CaptionJobMessage = z.infer<typeof captionJobMessageSchema>;
