import type { BadgeTone } from '@/components/ui/Badge';
import type { CaptionStatus } from '@/lib/types';

/**
 * One status → one badge, defined once.
 *
 * The old UI derived this in three components with three label sets
 * ("Processing", "In progress", "Generating…"), so the same item described
 * itself differently depending on the screen it appeared on. Shared so the card
 * and the watch page agree by construction rather than by coincidence.
 */
export const CAPTION_STATUS: Record<CaptionStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: 'neutral', label: 'No captions' },
  QUEUED: { tone: 'info', label: 'Queued' },
  PROCESSING: { tone: 'warning', label: 'Transcribing' },
  COMPLETED: { tone: 'success', label: 'Captions' },
  FAILED: { tone: 'danger', label: 'Failed' },
  SKIPPED: { tone: 'neutral', label: 'Not applicable' },
};

/** True while a transcription job is still expected to finish on its own. */
export function isInFlight(status: CaptionStatus | undefined): boolean {
  return status === 'QUEUED' || status === 'PROCESSING';
}
