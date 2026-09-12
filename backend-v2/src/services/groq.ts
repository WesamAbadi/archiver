/**
 * Groq Whisper transcription service.
 *
 * Design notes (verified against https://console.groq.com/docs/speech-to-text):
 * - POST https://api.groq.com/openai/v1/audio/transcriptions
 * - Models: whisper-large-v3-turbo (fast/cheap, transcription-only) and
 *   whisper-large-v3 (more accurate, also does translation). Default turbo;
 *   override via GROQ_MODEL.
 * - `url` parameter: Groq fetches the audio itself (Base64URL). We pass a
 *   presigned R2 GET URL so file bytes never transit the Worker and the
 *   25MB request-body limit doesn't apply to our files (Groq's own fetch).
 *   Presigned URLs are short-lived (10 min) — issued per attempt.
 * - response_format=verbose_json with timestamp_granularities[]=segment
 *   returns real Whisper timestamps (no more hallucinated MM:SS — this is
 *   what deletes the old Gemini timestamp heuristics).
 *
 * Error classification drives queue retry behavior:
 * - transient (retryable): network errors, 408/429/5xx, rate limits
 * - permanent (fail fast): 401/403 (bad key), 404 (missing object),
 *   413 (file too large), 400 unsupported file
 */
export interface GroqEnv {
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
}

export const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Timeout for a single Groq request. Turbo is very fast (<1 min/hour of audio); be generous but bounded. */
const GROQ_TIMEOUT_MS = 5 * 60 * 1000;

export type GroqErrorKind = 'transient' | 'permanent';

export class GroqError extends Error {
  readonly kind: GroqErrorKind;
  readonly status?: number;

  constructor(message: string, kind: GroqErrorKind, status?: number) {
    super(message);
    this.name = 'GroqError';
    this.kind = kind;
    this.status = status;
  }
}

function classify(status: number): GroqErrorKind {
  if (status === 408 || status === 429 || status >= 500) return 'transient';
  return 'permanent'; // 400, 401, 403, 404, 413, 422 ...
}

/** Exported for tests (classify is module-private otherwise). */
export const classify_ = classify;

// ---------------------------------------------------------------------------
// Response types (subset of verbose_json we consume)
// ---------------------------------------------------------------------------

export interface GroqSegment {
  start: number;
  end: number;
  text: string;
  /** Present in verbose_json; -1.0 when unknown */
  no_speech_prob?: number;
}

export interface GroqVerboseResponse {
  text: string;
  segments?: GroqSegment[];
  language?: string;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface TranscribeOptions {
  /** Presigned GET URL Groq will fetch the audio from */
  audioUrl: string;
  /** ISO-639-1 hint (e.g. 'en', 'ar') — improves accuracy/latency when known */
  language?: string;
}

/**
 * Transcribe audio at `audioUrl` via Groq Whisper (url mode — Groq fetches it).
 * Returns parsed verbose_json with segment timestamps.
 */
export async function transcribe(
  env: GroqEnv,
  opts: TranscribeOptions,
): Promise<GroqVerboseResponse> {
  const model = env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

  const form = new FormData();
  form.append('model', model);
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
    // Network failure / timeout -> always retryable
    throw new GroqError(
      `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
      'transient',
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Never include the API key; body text is Groq's own error message
    const detail = body.slice(0, 500);
    throw new GroqError(
      `Groq API error ${res.status}: ${detail || res.statusText}`,
      classify(res.status),
      res.status,
    );
  }

  const data = (await res.json()) as GroqVerboseResponse;

  if (typeof data?.text !== 'string') {
    // Malformed response — treat as transient so it retries (Groq-side glitch)
    throw new GroqError('Groq returned malformed response (missing text field)', 'transient');
  }

  return data;
}
