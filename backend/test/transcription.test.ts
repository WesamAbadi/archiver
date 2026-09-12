/**
 * Transcription provider tests.
 *
 * Both adapters are driven end to end with `fetch` stubbed, so what is asserted
 * is the actual outbound request — the model, the URL, the auth, and how the
 * bytes get to the provider. The two providers differ in exactly those things,
 * so this is where a mistake would be silent: a wrong field name still returns
 * 200 from a mocked fetch, and would only show up as a failing job in
 * production, inside a queue where nobody is watching.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { transcribe, TranscriptionError } from '../src/services/transcription';
import { transcribeWithGroq, DEFAULT_GROQ_MODEL } from '../src/services/transcription/groq';
import {
  transcribeWithGoogle,
  parseStructuredTranscript,
  DEFAULT_GOOGLE_MODEL,
  MAX_INLINE_AUDIO_BYTES,
} from '../src/services/transcription/google';
import { bytesToBase64 } from '../src/lib/base64';

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Stub global fetch so the adapter's real request can be inspected. */
function mockFetch(response: Response) {
  // Clone per call: the adapter consumes the body, and two calls in one test
  // should each see an intact response.
  const fn = vi.fn(async () => response.clone());
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Await a promise that is expected to reject, and hand back the error. */
async function capture(promise: Promise<unknown>): Promise<TranscriptionError> {
  try {
    await promise;
  } catch (err) {
    return err as TranscriptionError;
  }
  throw new Error('expected the call to reject, but it resolved');
}

const GROQ_ENV = { GROQ_API_KEY: 'gsk_test' };
const GOOGLE_ENV = { GEMINI_API_KEY: 'gemini_test' };

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

describe('Groq adapter', () => {
  it('sends the model, the signed URL and the timestamp opt-ins', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        text: 'hello world',
        language: 'ar',
        duration: 3.2,
        segments: [{ start: 0, end: 1, text: 'hello', no_speech_prob: 0.1 }],
      }),
    );

    const result = await transcribeWithGroq(GROQ_ENV, {
      audioUrl: 'https://signed.example/audio.mp3',
      model: DEFAULT_GROQ_MODEL,
      language: 'ar',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test');

    const form = init.body as FormData;
    expect(form.get('model')).toBe(DEFAULT_GROQ_MODEL);
    // The URL field is what keeps file bytes out of the Worker.
    expect(form.get('url')).toBe('https://signed.example/audio.mp3');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('segment');
    expect(form.get('temperature')).toBe('0');
    expect(form.get('language')).toBe('ar');

    expect(result.language).toBe('ar');
    expect(result.durationSeconds).toBe(3.2);
    expect(result.segments).toEqual([
      { start: 0, end: 1, text: 'hello', noSpeechProb: 0.1 },
    ]);
  });

  it('omits the language field when none is supplied', async () => {
    const fetchMock = mockFetch(jsonResponse({ text: 'x', segments: [] }));

    await transcribeWithGroq(GROQ_ENV, {
      audioUrl: 'https://signed.example/a.mp3',
      model: DEFAULT_GROQ_MODEL,
    });

    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as FormData;
    expect(form.get('language')).toBeNull();
  });

  it('leaves noSpeechProb undefined when the provider omits it', async () => {
    mockFetch(jsonResponse({ text: 'x', segments: [{ start: 0, end: 1, text: 'x' }] }));

    const result = await transcribeWithGroq(GROQ_ENV, {
      audioUrl: 'https://signed.example/a.mp3',
      model: DEFAULT_GROQ_MODEL,
    });

    expect(result.segments[0]?.noSpeechProb).toBeUndefined();
  });

  it('refuses to run without an API key, without making a request', async () => {
    const fetchMock = mockFetch(jsonResponse({}));

    const err = await capture(
      transcribeWithGroq({}, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err.kind).toBe('permanent');
    expect(err.provider).toBe('GROQ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies a 413 as permanent, since retrying a too-large file cannot work', async () => {
    mockFetch(new Response('{"error":"file too large"}', { status: 413 }));

    const err = await capture(
      transcribeWithGroq(GROQ_ENV, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.status).toBe(413);
    expect(err.message).toContain('size limit');
  });

  it('classifies a 429 as transient so the queue backs off and retries', async () => {
    mockFetch(new Response('{"error":"rate limited"}', { status: 429 }));

    const err = await capture(
      transcribeWithGroq(GROQ_ENV, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err.kind).toBe('transient');
    expect(err.status).toBe(429);
  });

  it('treats a network failure as transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    const err = await capture(
      transcribeWithGroq(GROQ_ENV, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err.kind).toBe('transient');
    expect(err.message).toContain('network down');
  });

  it('treats a 200 with no text field as transient (provider glitch, not a bad file)', async () => {
    mockFetch(jsonResponse({ segments: [] }));

    const err = await capture(
      transcribeWithGroq(GROQ_ENV, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err.kind).toBe('transient');
  });

  it('never puts the API key in the error message', async () => {
    mockFetch(new Response('server said no', { status: 500 }));

    const err = await capture(
      transcribeWithGroq(GROQ_ENV, { audioUrl: 'https://x/a.mp3', model: DEFAULT_GROQ_MODEL }),
    );

    expect(err.message).not.toContain('gsk_test');
  });
});

// ---------------------------------------------------------------------------
// Google (Gemini)
// ---------------------------------------------------------------------------

const AUDIO_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff]);

function fakeBucket(bytes: Uint8Array = AUDIO_BYTES) {
  const get = vi.fn(async () => ({
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }));
  return { bucket: { get } as unknown as R2Bucket, get };
}

const googleEnv = (extra: Record<string, unknown> = {}) =>
  ({
    ...GOOGLE_ENV,
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
    ...extra,
  }) as never;

const geminiText = (payload: unknown, finishReason = 'STOP') =>
  jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason }],
  });

describe('Google adapter', () => {
  it('inlines the audio as base64 and asks for structured JSON', async () => {
    const fetchMock = mockFetch(
      geminiText({ language: 'ar', segments: [{ start: 0, end: 1.2, text: 'مرحبا' }] }),
    );
    const { bucket } = fakeBucket();

    const result = await transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
      objectKey: 'users/u/m/file.mp3',
      mimeType: 'audio/mpeg',
      size: AUDIO_BYTES.length,
      model: DEFAULT_GOOGLE_MODEL,
      language: 'ar',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    // The key travels in a header, never in the URL (URLs land in logs).
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GOOGLE_MODEL}:generateContent`,
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('gemini_test');
    expect(url).not.toContain('gemini_test');

    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseSchema).toBeTruthy();

    const parts = body.contents[0].parts as Array<Record<string, never>>;
    const inlineData = (
      parts.find((p) => 'inlineData' in p) as unknown as {
        inlineData: { mimeType: string; data: string };
      }
    ).inlineData;
    // Google names mp3 `audio/mp3`; sending `audio/mpeg` is rejected.
    expect(inlineData.mimeType).toBe('audio/mp3');
    expect(inlineData.data).toBe(bytesToBase64(AUDIO_BYTES));

    const prompt = (parts.find((p) => 'text' in p) as unknown as { text: string }).text;
    expect(prompt).toContain('ar');

    expect(result.language).toBe('ar');
    expect(result.segments).toEqual([{ start: 0, end: 1.2, text: 'مرحبا' }]);
    expect(result.text).toBe('مرحبا');
  });

  it('refuses a file over the inline limit before reading it', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const { get } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: { get } as unknown as R2Bucket }), {
        objectKey: 'users/u/m/big.mp3',
        mimeType: 'audio/mpeg',
        size: MAX_INLINE_AUDIO_BYTES + 1,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.message).toContain('Groq');
    // The guard must run before the file is pulled into memory.
    expect(get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a container Google cannot read, naming the ones it can', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const { get } = fakeBucket();

    // audio/webm is accepted by our upload allowlist but not by Gemini — so this
    // is a real combination, not a hypothetical one.
    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: { get } as unknown as R2Bucket }), {
        objectKey: 'users/u/m/file.webm',
        mimeType: 'audio/webm',
        size: 1024,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.message).toContain('audio/mp3');
    expect(get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to run without an API key', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle({ MEDIA_BUCKET: bucket } as never, {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.provider).toBe('GOOGLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a missing storage object as permanent', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const get = vi.fn(async () => null);

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: { get } as unknown as R2Bucket }), {
        objectKey: 'users/u/m/gone.mp3',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hints at a bad model id on a 404, since that is the likely cause', async () => {
    mockFetch(new Response('{"error":{"message":"model not found"}}', { status: 404 }));
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: 'gemini-nope',
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.status).toBe(404);
    expect(err.message).toContain('gemini-nope');
  });

  it('classifies a 429 as transient', async () => {
    mockFetch(new Response('quota', { status: 429 }));
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('transient');
  });

  it('fails permanently when the model refuses the audio', async () => {
    mockFetch(jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }));
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.message).toContain('SAFETY');
  });

  it('fails permanently when the candidate stops for a non-STOP reason', async () => {
    mockFetch(
      jsonResponse({ candidates: [{ content: { parts: [] }, finishReason: 'RECITATION' }] }),
    );
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('permanent');
    expect(err.message).toContain('RECITATION');
  });

  it('retries an empty 200, which is a provider-side oddity rather than a bad file', async () => {
    mockFetch(jsonResponse({ candidates: [] }));
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('transient');
  });

  it('returns no text when the transcript is prose instead of JSON', async () => {
    mockFetch(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'I cannot transcribe this.' }] } }],
      }),
    );
    const { bucket } = fakeBucket();

    const err = await capture(
      transcribeWithGoogle(googleEnv({ MEDIA_BUCKET: bucket }), {
        objectKey: 'k',
        mimeType: 'audio/mpeg',
        size: 10,
        model: DEFAULT_GOOGLE_MODEL,
      }),
    );

    expect(err.kind).toBe('transient');
  });
});

describe('parseStructuredTranscript', () => {
  it('parses a clean payload', () => {
    const parsed = parseStructuredTranscript(
      JSON.stringify({ language: 'ar', segments: [{ start: 0, end: 1, text: 'hello' }] }),
    );
    expect(parsed.language).toBe('ar');
    expect(parsed.segments).toHaveLength(1);
  });

  it('unwraps a fenced JSON block', () => {
    const raw = '```json\n{"segments":[{"start":0,"end":1,"text":"hi"}]}\n```';
    expect(parseStructuredTranscript(raw).segments).toHaveLength(1);
  });

  it('coerces string timings into numbers', () => {
    const raw = JSON.stringify({ segments: [{ start: '1.5', end: '2.5', text: 'hi' }] });
    expect(parseStructuredTranscript(raw).segments[0]).toEqual({
      start: 1.5,
      end: 2.5,
      text: 'hi',
    });
  });

  it('drops entries missing a timing or text', () => {
    const raw = JSON.stringify({
      segments: [
        { start: 0, end: 1, text: 'kept' },
        { start: 1, end: 2 },
        { start: 'nope', end: 3, text: 'dropped' },
        { start: 3, end: 4, text: '   ' },
      ],
    });
    expect(parseStructuredTranscript(raw).segments).toEqual([
      { start: 0, end: 1, text: 'kept' },
    ]);
  });

  it('rejects invalid JSON as transient', () => {
    const err = (() => {
      try {
        parseStructuredTranscript('not json');
      } catch (e) {
        return e as TranscriptionError;
      }
      throw new Error('expected a throw');
    })();
    expect(err.kind).toBe('transient');
  });

  it('rejects a payload with no usable segments as permanent', () => {
    const err = (() => {
      try {
        parseStructuredTranscript('{"segments":[]}');
      } catch (e) {
        return e as TranscriptionError;
      }
      throw new Error('expected a throw');
    })();
    expect(err.kind).toBe('permanent');
  });
});

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

describe('transcribe() dispatcher', () => {
  const presignEnv = {
    GROQ_API_KEY: 'gsk_test',
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
  } as never;

  it('Groq: signs a fresh URL and hands it to the provider', async () => {
    const fetchMock = mockFetch(jsonResponse({ text: 'x', segments: [] }));

    await transcribe(
      presignEnv,
      { provider: 'GROQ', model: DEFAULT_GROQ_MODEL },
      { objectKey: 'users/u/m/file.mp3', mimeType: 'audio/mpeg', size: 10 },
    );

    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as FormData;
    const signed = String(form.get('url'));
    expect(signed).toContain('acct.r2.cloudflarestorage.com/bucket/users/u/m/file.mp3');
    expect(signed).toContain('X-Amz-Signature');
  });

  it('Google: sends JSON from the bucket, and no bearer token', async () => {
    const fetchMock = mockFetch(geminiText({ language: 'en', segments: [{ start: 0, end: 1, text: 'x' }] }));
    const { bucket } = fakeBucket();

    await transcribe(
      { ...(presignEnv as object), GEMINI_API_KEY: 'gemini_test', MEDIA_BUCKET: bucket } as never,
      { provider: 'GOOGLE', model: DEFAULT_GOOGLE_MODEL },
      { objectKey: 'users/u/m/file.mp3', mimeType: 'audio/mpeg', size: AUDIO_BYTES.length },
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('generativelanguage.googleapis.com');
    // The Groq key must not leak to Google, nor a bearer header appear at all.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(String(init.body)).not.toContain('gsk_test');
    expect(() => JSON.parse(String(init.body))).not.toThrow();
  });
});
