/** Formatting helpers. Pure functions — unit-testable without a DOM. */

const KB = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < KB) return `${bytes} B`;

  let value = bytes;
  let unit = 0;
  while (value >= KB && unit < UNITS.length - 1) {
    value /= KB;
    unit += 1;
  }
  const unitLabel = UNITS[unit] ?? 'B';
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unitLabel}`;
}

/** "3:45" / "1:02:33" — for durations shown in lists. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * "01:23.456" — editor/transcript timecode. Mono type, millisecond precision,
 * which is what you need when nudging caption segment boundaries.
 */
export function formatTimecode(seconds: number, withMilliseconds = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const base = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (!withMilliseconds) return base;
  const ms = Math.round((seconds % 1) * 1000);
  return `${base}.${String(ms).padStart(3, '0')}`;
}

/** "2026-09-12" style short date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** "3 days ago" — used in list metadata. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= unitSeconds) {
      return formatter.format(Math.round(diffSeconds / unitSeconds), unit);
    }
  }
  return formatter.format(Math.round(diffSeconds), 'second');
}

/** Human label for a mime type, e.g. "audio/mpeg" → "Audio". */
export function mediaKind(mimeType: string | undefined): 'audio' | 'video' | 'image' | 'other' {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}
