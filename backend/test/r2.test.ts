import { describe, it, expect } from 'vitest';
import { objectKeyFor, isAllowedMimeType, ALLOWED_MIME_TYPES } from '../src/services/r2';

describe('objectKeyFor', () => {
  it('builds a user/media-scoped key preserving extension', () => {
    expect(objectKeyFor('user1', 'media1', 'My Song.mp3')).toBe('users/user1/media1/original.mp3');
  });

  it('sanitizes weird extensions', () => {
    expect(objectKeyFor('user1', 'media1', 'track.M4A!?')).toBe('users/user1/media1/original.m4a');
  });

  it('falls back to .bin when there is no extension', () => {
    expect(objectKeyFor('user1', 'media1', 'noext')).toBe('users/user1/media1/original.bin');
  });

  it('never lets the extension escape the key scheme', () => {
    const key = objectKeyFor('user1', 'media1', 'x.//../../evil');
    expect(key.startsWith('users/user1/media1/original.')).toBe(true);
    expect(key).not.toContain('..');
  });
});

describe('isAllowedMimeType', () => {
  it('accepts audio and video types', () => {
    expect(isAllowedMimeType('audio/mpeg')).toBe(true);
    expect(isAllowedMimeType('video/mp4')).toBe(true);
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
  });

  it('rejects arbitrary types', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(false);
    expect(isAllowedMimeType('')).toBe(false);
    expect(isAllowedMimeType('../../etc/passwd')).toBe(false);
  });

  it('allowlist has no duplicates', () => {
    expect(new Set(ALLOWED_MIME_TYPES).size).toBe(ALLOWED_MIME_TYPES.length);
  });
});
