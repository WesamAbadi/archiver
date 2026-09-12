/**
 * Transcription dispatcher.
 *
 * One entry point, so nothing downstream branches on the provider: the consumer
 * asks for a transcript of an object and gets the same shape back either way.
 * The provider is chosen in Settings and stored in `app_settings`.
 *
 * The trade between the two is real and is not hidden here:
 * - Groq/Whisper decodes timestamps. It is the default because this app's
 *   timeline features (lyric highlighting, `?to` deep links, the editor) depend
 *   on segment times being measured rather than estimated.
 * - Google/Gemini estimates them. It handles a different set of formats and has
 *   file-size limits, but timing accuracy is not something it can promise.
 */
import { presignedGetUrl, type PresignEnv } from '../r2';
import { transcribeWithGroq, DEFAULT_GROQ_MODEL } from './groq';
import { transcribeWithGoogle, DEFAULT_GOOGLE_MODEL } from './google';
import type { TranscriptionProvider, TranscriptionResult } from './types';

export * from './types';
export { GEMINI_SUPPORTED_MIME_TYPES, MAX_INLINE_AUDIO_BYTES } from './google';

/**
 * The model used when none has been chosen for a provider. Keep these in step
 * with the suggestions shown in the Settings UI (`frontend/src/lib/types.ts`).
 */
export const TRANSCRIPTION_MODELS: Record<TranscriptionProvider, string> = {
  GROQ: DEFAULT_GROQ_MODEL,
  GOOGLE: DEFAULT_GOOGLE_MODEL,
};

/**
 * The provider list as a tuple, in the order the UI should offer them. A tuple
 * rather than `string[]` on purpose: `z.enum(PROVIDERS)` in routes/settings.ts
 * needs a literal tuple, and it makes the parsed value narrow to
 * `TranscriptionProvider` instead of widening to `string`.
 */
export const PROVIDERS = ['GROQ', 'GOOGLE'] as const satisfies readonly TranscriptionProvider[];

export function defaultModelFor(provider: TranscriptionProvider): string {
  return TRANSCRIPTION_MODELS[provider];
}

export interface TranscriptionEnv extends PresignEnv {
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export interface TranscribeOptions {
  /** R2 object key. Each provider gets it differently — see below. */
  objectKey: string;
  /** Stored mime type of the file; Google maps it, Groq ignores it. */
  mimeType: string;
  /** Bytes, so Google can refuse an oversized file before reading it. */
  size: number;
  language?: string;
}

export interface ProviderSelection {
  provider: TranscriptionProvider;
  model: string;
}

/** Groq fetches the audio itself; the URL is short-lived, so it is signed per attempt. */
const PRESIGN_TTL_SECONDS = 600;

export async function transcribe(
  env: TranscriptionEnv,
  selection: ProviderSelection,
  opts: TranscribeOptions,
): Promise<TranscriptionResult> {
  if (selection.provider === 'GOOGLE') {
    // Google has no URL mode: it gets the bytes, so the adapter reads R2 itself.
    return transcribeWithGoogle(env, {
      objectKey: opts.objectKey,
      mimeType: opts.mimeType,
      size: opts.size,
      model: selection.model,
      language: opts.language,
    });
  }

  const audioUrl = await presignedGetUrl(env, opts.objectKey, PRESIGN_TTL_SECONDS);
  return transcribeWithGroq(env, {
    audioUrl,
    language: opts.language,
    model: selection.model,
  });
}
