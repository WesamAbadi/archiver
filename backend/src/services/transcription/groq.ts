/**
 * Groq Whisper adapter.
 *
 * Design notes (verified against https://console.groq.com/docs/speech-to-text):
 * - POST https://api.groq.com/openai/v1/audio/transcriptions
 * - Models: whisper-large-v3-turbo (fast/cheap, transcription-only) and
 *   whisper-large-v3 (more accurate, also does translation). Overridable from
 *   Settings; see TRANSCRIPTION_MODELS in ./index.ts.
 * - `url` parameter: Groq fetches the audio itself (Base64URL). We pass a
 *   presigned R2 GET URL so file bytes never transit the Worker and the
 *   25MB request-body limit doesn't apply to our files (Groq's own fetch).
 *   Presigned URLs are short-lived — issued per attempt by the dispatcher.
 * - response_format=verbose_json with timestamp_granularities[]=segment
 *   returns real Whisper timestamps, decoded rather than estimated. This is the
 *   reason Groq is the default provider.
 */
import {
  TranscriptionError,
  classifyHttpStatus,
  type TranscriptionResult,
} from './types';

export interface GroqEnv {
  GROQ_API_KEY?: string;
}

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Turbo is very fast (<1 min/hour of audio); generous but bounded. */
const GROQ_TIMEOUT_MS = 5 * 60 * 1000;

export const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';

export interface GroqVerboseResponse {
  text: string;
  segments?: Array<{ start: number; end: number; text: string; no_speech_prob?: number }>;
  language?: string;
  duration?: number;
}

export interface GroqTranscribeOptions {
  /** Presigned GET URL Groq will fetch the audio from. */
  audioUrl: string;
  /** ISO-639-1 hint (e.g. 'en', 'ar') — improves accuracy/latency when known. */
  language?: string;
  model: string;
}

export async function transcribeWithGroq(
  env: GroqEnv,
  opts: GroqTranscribeOptions,
): Promise<TranscriptionResult> {
  if (!env.GROQ_API_KEY) {
    throw new TranscriptionError(
      'Transcription provider is set to Groq but GROQ_API_KEY is not configured',
      'permanent',
      'GROQ',
    );
  }

  const form = new FormData();
  form.append('model', opts.model);
  form.append('url', opts.audioUrl);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  if (opts.language) {
    form.append('language', opts.language);
  }

  let res: Response;
  try {
    res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure or timeout — always worth retrying.
    throw new TranscriptionError(
      `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
      'transient',
      'GROQ',
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Never include the API key; `body` is Groq's own error message, capped.
    const detail = body.slice(0, 500);
    const kind = classifyHttpStatus(res.status);
    const hint =
      res.status === 413
        ? ' (audio exceeds the Groq plan size limit — try a smaller file or another provider)'
        : '';
    throw new TranscriptionError(
      `Groq API error ${res.status}: ${detail || res.statusText}${hint}`,
      kind,
      'GROQ',
      res.status,
    );
  }

  const data = (await res.json()) as GroqVerboseResponse;

  if (typeof data?.text !== 'string') {
    // Malformed response — treat as transient, this is a provider-side glitch.
    throw new TranscriptionError(
      'Groq returned a malformed response (missing text)',
      'transient',
      'GROQ',
    );
  }

  return {
    text: data.text,
    language: data.language,
    durationSeconds: data.duration,
    segments: (data.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      noSpeechProb: typeof s.no_speech_prob === 'number' ? s.no_speech_prob : undefined,
    })),
  };
}
