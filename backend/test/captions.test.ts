import { describe, it, expect } from 'vitest';
import {
  normalizeSegments,
  backoffSeconds,
  isTranscribable,
  jobStatusCounts,
} from '../src/services/captions';
import { GroqError, classify_ } from '../src/services/groq';
import { captionJobMessageSchema } from '../src/queue/messages';

describe('normalizeSegments (Whisper output guardrail)', () => {
  it('passes through well-formed segments', () => {
    const out = normalizeSegments([
      { start: 0, end: 2.5, text: 'Hello world' },
      { start: 2.5, end: 5, text: 'Second line' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ startTime: 0, endTime: 2.5, text: 'Hello world' });
  });

  it('drops empty/whitespace text segments', () => {
    const out = normalizeSegments([
      { start: 0, end: 1, text: '   ' },
      { start: 1, end: 2, text: 'kept' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('kept');
  });

  it('enforces chronological ordering (overlaps clamp to previous end)', () => {
    const out = normalizeSegments([
      { start: 5, end: 8, text: 'first' },
      { start: 4, end: 9, text: 'overlapping' },
    ]);
    expect(out[1]?.startTime).toBe(8); // clamped to previous end
    expect(out[1]?.endTime).toBe(9);
  });

  it('repairs zero/negative-duration segments', () => {
    const out = normalizeSegments([{ start: 3, end: 3, text: 'zero' }]);
    expect(out[0]?.endTime).toBeGreaterThan(out[0]?.startTime ?? 0);
  });

  it('clamps negative starts and drops NaN timings', () => {
    const out = normalizeSegments([
      { start: -2, end: 1, text: 'neg' },
      { start: NaN, end: 2, text: 'nan' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.startTime).toBe(0);
  });

  it('derives confidence from no_speech_prob', () => {
    const out = normalizeSegments([{ start: 0, end: 1, text: 'x', no_speech_prob: 0.2 }]);
    expect(out[0]?.confidence).toBeCloseTo(0.8);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeSegments(undefined)).toEqual([]);
  });
});

describe('backoffSeconds', () => {
  it('grows quadratically: 1min, 4min, 9min', () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(240);
    expect(backoffSeconds(3)).toBe(540);
  });

  it('caps at 1 hour', () => {
    expect(backoffSeconds(50)).toBe(3600);
  });
});

describe('isTranscribable', () => {
  it('accepts audio/*', () => {
    expect(isTranscribable('audio/mpeg')).toBe(true);
    expect(isTranscribable('AUDIO/WAV')).toBe(true);
  });

  it('rejects video/images/other in v1', () => {
    expect(isTranscribable('video/mp4')).toBe(false);
    expect(isTranscribable('image/png')).toBe(false);
  });
});

describe('GroqError classification', () => {
  it('classifies retryable statuses as transient', () => {
    expect(classify_(408)).toBe('transient');
    expect(classify_(429)).toBe('transient');
    expect(classify_(500)).toBe('transient');
    expect(classify_(503)).toBe('transient');
  });

  it('classifies client errors as permanent', () => {
    expect(classify_(400)).toBe('permanent');
    expect(classify_(401)).toBe('permanent');
    expect(classify_(403)).toBe('permanent');
    expect(classify_(404)).toBe('permanent');
    expect(classify_(413)).toBe('permanent');
  });

  it('GroqError carries kind and status', () => {
    const err = new GroqError('boom', 'transient', 429);
    expect(err.kind).toBe('transient');
    expect(err.status).toBe(429);
    expect(err.name).toBe('GroqError');
  });
});

describe('captionJobMessageSchema', () => {
  it('accepts a valid v1 message', () => {
    const msg = { version: 1, jobId: 'j1', mediaItemId: 'm1', userUid: 'u1' };
    expect(captionJobMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects wrong version / missing fields', () => {
    expect(
      captionJobMessageSchema.safeParse({ version: 2, jobId: 'j', mediaItemId: 'm', userUid: 'u' })
        .success,
    ).toBe(false);
    expect(captionJobMessageSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe('jobStatusCounts', () => {
  it('aggregates status rows', () => {
    const counts = jobStatusCounts([
      { status: 'QUEUED' },
      { status: 'QUEUED' },
      { status: 'COMPLETED' },
    ] as never);
    expect(counts).toEqual({ QUEUED: 2, COMPLETED: 1 });
  });
});
