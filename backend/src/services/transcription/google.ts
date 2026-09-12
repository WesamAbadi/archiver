/**
 * Google (Gemini) adapter.
 *
 * ── The honest caveat ────────────────────────────────────────────────────────
 * Gemini has **no timestamp decoder**. Groq returns times Whisper's decoder
 * produced; Gemini returns times it *estimates* from the audio when asked, so
 * segment boundaries are approximate. That is the exact unreliability that made
 * the previous Gemini-based pipeline get replaced, and it is why Groq is the
 * default. The lyrics timing, the `?t=` deep links and the editor all rest on
 * these numbers, so choosing this provider is a quality trade, not a preference.
 *
 * ── Which API ────────────────────────────────────────────────────────────────
 * `models.generateContent` — Google's *legacy* surface, which their docs state
 * remains fully supported, in preference to the newer Interactions API. Legacy
 * is the safer pick here for a frozen, well-documented request/response shape;
 * the Interactions API was still changing shape in 2026. Everything specific to
 * this choice is inside this file, so switching surfaces touches nothing else.
 *
 * ── Why the bytes move ───────────────────────────────────────────────────────
 * Groq can fetch a URL; Gemini cannot. There is no URL mode, so the Worker reads
 * the object from R2 and inlines it as base64, which is why this adapter needs
 * the R2 binding and a size guard — the whole request must stay under 20MB.
 */
import { arrayBufferToBase64 } from '../../lib/base64';
import type { R2Env } from '../r2';
import {
  TranscriptionError,
  classifyHttpStatus,
  type TranscriptionResult,
} from './types';

export interface GoogleEnv extends R2Env {
  GEMINI_API_KEY?: string;
}

export const DEFAULT_GOOGLE_MODEL = 'gemini-3.8-flash';

/** Google's request cap is 20MB total, prompt included. Base64 costs 4/3. */
export const MAX_INLINE_AUDIO_BYTES = 14 * 1024 * 1024;

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Gemini accepts a narrower set of audio containers than our upload allowlist,
 * and it names mp3 `audio/mp3` rather than `audio/mpeg`. Anything missing here is
 * rejected with a message naming the types that do work, because "unsupported"
 * with no list is a support ticket.
 */
const GEMINI_AUDIO_MIME: Record<string, string> = {
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/aac': 'audio/aac',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
  'audio/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
};

export const GEMINI_SUPPORTED_MIME_TYPES = Object.freeze(
  Object.keys(GEMINI_AUDIO_MIME).sort(),
);

const PROMPT = [
  'Transcribe this audio into timed segments.',
  '',
  'Rules:',
  '- Transcribe exactly what is spoken, in its original language and script. Do not translate.',
  '- One segment per phrase or sentence.',
  '- "start" and "end" are seconds from the beginning of the audio, as numbers.',
  '- Preserve the original script (for example Arabic stays in Arabic).',
  '- Never invent words. If a passage is unintelligible, leave it out rather than guessing.',
  '- Report the language you detected in "language".',
].join('\n');

/**
 * Structured output, so the response is parseable JSON rather than prose that
 * has to be scraped. Numbers are declared as numbers: asking a model for "MM:SS"
 * and parsing it back is how timestamp bugs get introduced.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number' },
          end: { type: 'number' },
          text: { type: 'string' },
        },
        required: ['start', 'end', 'text'],
      },
    },
  },
  required: ['language', 'segments'],
} as const;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface GoogleTranscribeOptions {
  /** R2 object key of the audio to transcribe. */
  objectKey: string;
  mimeType: string;
  /** Size in bytes, used for the inline guard before anything is read. */
  size: number;
  model: string;
  /** ISO-639-1 hint ('ar'), passed as a nudge in the prompt. */
  language?: string;
}

export async function transcribeWithGoogle(
  env: GoogleEnv,
  opts: GoogleTranscribeOptions,
): Promise<TranscriptionResult> {
  if (!env.GEMINI_API_KEY) {
    throw new TranscriptionError(
      'Transcription provider is set to Google but GEMINI_API_KEY is not configured',
      'permanent',
      'GOOGLE',
    );
  }

  const geminiMime = GEMINI_AUDIO_MIME[opts.mimeType.toLowerCase()];
  if (!geminiMime) {
    throw new TranscriptionError(
      `Google cannot transcribe ${opts.mimeType}. Supported: ${GEMINI_SUPPORTED_MIME_TYPES.join(', ')} — switch this file's provider to Groq.`,
      'permanent',
      'GOOGLE',
    );
  }

  if (opts.size > MAX_INLINE_AUDIO_BYTES) {
    throw new TranscriptionError(
      `File is ${(opts.size / 1024 / 1024).toFixed(1)}MB; Google accepts at most ${(MAX_INLINE_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB inline — switch this file's provider to Groq.`,
      'permanent',
      'GOOGLE',
    );
  }

  if (!env.MEDIA_BUCKET) {
    throw new TranscriptionError(
      'R2 binding is unavailable, so the audio cannot be read for Google transcription',
      'transient',
      'GOOGLE',
    );
  }

  const object = await env.MEDIA_BUCKET.get(opts.objectKey);
  if (!object) {
    // The file row exists but the object is gone — retrying changes nothing.
    throw new TranscriptionError(
      `Audio object not found in storage: ${opts.objectKey}`,
      'permanent',
      'GOOGLE',
    );
  }

  const audio = await object.arrayBuffer();

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: opts.language ? `${PROMPT}\n- The audio is expected to be in ${opts.language}.` : PROMPT },
          { inlineData: { mimeType: geminiMime, data: arrayBufferToBase64(audio) } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than ?key= so the secret stays out of URLs and logs.
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new TranscriptionError(
      `Google request failed: ${err instanceof Error ? err.message : String(err)}`,
      'transient',
      'GOOGLE',
    );
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    const detail = raw.slice(0, 500);
    // 404 here is almost always a bad model id, which the admin can fix.
    const hint =
      res.status === 404
        ? ` (is "${opts.model}" a valid model id for this API key?)`
        : res.status === 400
          ? ' (check the model id and that the API key allows it)'
          : '';
    throw new TranscriptionError(
      `Google API error ${res.status}: ${detail || res.statusText}${hint}`,
      classifyHttpStatus(res.status),
      'GOOGLE',
      res.status,
    );
  }

  const data = (await res.json()) as GeminiResponse;

  const blocked = data.promptFeedback?.blockReason;
  if (blocked) {
    throw new TranscriptionError(
      `Google refused to transcribe this audio (${blocked})`,
      'permanent',
      'GOOGLE',
    );
  }

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new TranscriptionError(
        `Google returned no transcript (finishReason: ${candidate.finishReason})`,
        'permanent',
        'GOOGLE',
      );
    }
    // Empty candidate list with a 200 — provider-side oddity, worth one retry.
    throw new TranscriptionError('Google returned an empty response', 'transient', 'GOOGLE');
  }

  const parsed = parseStructuredTranscript(text);

  return {
    text: parsed.segments.map((s) => s.text).join(' '),
    language: parsed.language,
    segments: parsed.segments,
  };
}

interface ParsedTranscript {
  language?: string;
  segments: Array<{ start: number; end: number; text: string }>;
}

/**
 * Parse the structured payload, tolerating the small ways a model still colours
 * outside the lines (a fenced code block, a string where a number belongs).
 * Segments are sanity-checked here only lightly — `normalizeSegments` in the
 * caption service is the single place that enforces ordering and positivity.
 */
export function parseStructuredTranscript(raw: string): ParsedTranscript {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let value: unknown;
  try {
    value = JSON.parse(unfenced);
  } catch {
    throw new TranscriptionError(
      'Google returned a response that was not valid JSON',
      'transient',
      'GOOGLE',
    );
  }

  if (typeof value !== 'object' || value === null) {
    throw new TranscriptionError('Google returned an unexpected payload', 'transient', 'GOOGLE');
  }

  const record = value as Record<string, unknown>;
  const rawSegments = Array.isArray(record.segments) ? record.segments : [];

  const segments = rawSegments
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const s = entry as Record<string, unknown>;
      const start = Number(s.start);
      const end = Number(s.end);
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return null;
      return { start, end, text };
    })
    .filter((s): s is { start: number; end: number; text: string } => s !== null);

  if (segments.length === 0) {
    throw new TranscriptionError(
      'Google returned no usable segments',
      'permanent',
      'GOOGLE',
    );
  }

  return {
    language: typeof record.language === 'string' ? record.language : undefined,
    segments,
  };
}
