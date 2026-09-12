import { mediaKind } from '@/lib/format';

/**
 * Read a media file's duration, in seconds, from the browser.
 *
 * Files upload straight to R2, so the API never sees the bytes and cannot work
 * this out — the browser is the only place the real value exists. `preload =
 * "metadata"` reads just the container header (no decoding), and the object URL
 * is revoked as soon as we're done.
 *
 * Resolves null instead of throwing when the file isn't audio/video, when the
 * browser can't decode it, or when the read stalls. A cosmetic field must never
 * be able to fail an upload.
 */
export function readMediaDuration(file: File): Promise<number | null> {
  const kind = mediaKind(file.type);
  if (kind !== 'audio' && kind !== 'video') return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element =
      kind === 'video' ? document.createElement('video') : document.createElement('audio');

    function settle(seconds: number | null) {
      clearTimeout(timer);
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(seconds);
    }

    // Some containers report metadata but never fire the event; don't hang.
    const timer = setTimeout(() => settle(null), 10_000);

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const seconds = element.duration;
      settle(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null);
    };
    element.onerror = () => settle(null);

    element.src = url;
  });
}
