/**
 * The contract every transcription provider implements.
 *
 * Two providers exist because they fail in different ways and cost differently,
 * and the admin picks one in Settings. Keeping one result type and one error type
 * means the queue consumer, the caption service and the database never learn
 * which provider ran — swapping one in is not a change anywhere else.
 *
 * Leaf module on purpose: adapters import from here, this file imports nothing,
 * so there is no cycle between the dispatcher and its providers.
 */

/** Which backend runs transcriptions. Mirrors the `transcription_provider` enum. */
export type TranscriptionProvider = 'GROQ' | 'GOOGLE';

/** One timed line of speech, provider-neutral. */
export interface TranscriptionSegment {
  /** Seconds from the start of the audio. */
  start: number;
  end: number;
  text: string;
  /**
   * Whisper's `no_speech_prob`, inverted. Only Groq can supply it — it is a real
   * decoder signal. Undefined means "unknown", not "certain speech".
   */
  noSpeechProb?: number;
}

export interface TranscriptionResult {
  /** Full text, before segmenting. */
  text: string;
  segments: TranscriptionSegment[];
  /** BCP-47-ish language name/code as the provider reported it. */
  language?: string;
  /** Duration the provider actually processed, when it reports one. */
  durationSeconds?: number;
}

/**
 * Whether retrying could help. This drives queue behaviour, so it is the most
 * consequential thing a provider decides:
 *
 * - `transient` — network blips, rate limits, provider 5xx. The message is
 *   negatively-acked with exponential backoff and retried.
 * - `permanent` — bad key, missing object, unsupported format, too large. No
 *   amount of retrying fixes it, so it fails fast and lands in
 *   `captionErrorMessage` where it can be read, instead of burning attempts
 *   into the dead-letter queue.
 */
export type TranscriptionErrorKind = 'transient' | 'permanent';

export class TranscriptionError extends Error {
  readonly kind: TranscriptionErrorKind;
  readonly provider: TranscriptionProvider;
  readonly status?: number;

  constructor(
    message: string,
    kind: TranscriptionErrorKind,
    provider: TranscriptionProvider,
    status?: number,
  ) {
    super(message);
    this.name = 'TranscriptionError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

/**
 * Classify an HTTP status from any provider. Shared because both Google and Groq
 * agree on the shape of an HTTP error, and because the old app got this wrong in
 * the direction that matters: it retried 4xx responses until the queue gave up.
 */
export function classifyHttpStatus(status: number): TranscriptionErrorKind {
  // 408 timeout, 409 conflict, 425 too early, 429 rate limited, 5xx provider-side.
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return 'transient';
  }
  return 'permanent';
}
