import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { formatTimecode } from '@/lib/format';
import { RTL_FONT_STACK, textDirection } from '@/lib/rtl';
import type { CaptionSegment } from '@/lib/types';

/**
 * Timestamped transcript that follows playback.
 *
 * The old player kept its "active line" in component state that was never
 * cleared on seek, so scrubbing backwards left the wrong line highlighted. Here
 * the active segment is *derived* from currentTime every render — it cannot
 * disagree with the playhead.
 */
export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
}: {
  segments: CaptionSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const activeId = useMemo(() => {
    // Binary search: transcripts can be thousands of segments, and this runs on
    // every timeupdate tick.
    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const segment = segments[mid];
      if (!segment) break;
      if (currentTime < segment.startTime) high = mid - 1;
      else if (currentTime >= segment.endTime) low = mid + 1;
      else return segment.id;
    }
    return null;
  }, [segments, currentTime]);

  return (
    <ol className="divide-y divide-border/60" data-testid="transcript">
      {segments.map((segment) => {
        const isActive = segment.id === activeId;

        return (
          <li key={segment.id}>
            <button
              type="button"
              onClick={() => onSeek(segment.startTime)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                isActive ? 'bg-accent/10' : 'hover:bg-surface-2/60',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0 font-mono text-[11px] tabular-nums transition-colors',
                  isActive ? 'text-accent' : 'text-ink-faint',
                )}
              >
                {formatTimecode(segment.startTime)}
              </span>

              <span
                dir={textDirection(segment.text)}
                style={
                  textDirection(segment.text) === 'rtl'
                    ? { fontFamily: RTL_FONT_STACK }
                    : undefined
                }
                className={cn(
                  'flex-1 text-sm leading-relaxed',
                  isActive ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {segment.text}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Just the current line, for a large "now playing" caption display. */
export function ActiveCaption({ segments, currentTime }: { segments: CaptionSegment[]; currentTime: number }) {
  const active = segments.find((s) => currentTime >= s.startTime && currentTime < s.endTime);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active?.id]);

  if (!active) return null;

  const dir = textDirection(active.text);

  return (
    <p
      ref={ref}
      dir={dir}
      style={dir === 'rtl' ? { fontFamily: RTL_FONT_STACK } : undefined}
      className="px-4 py-3 text-center font-display text-xl leading-relaxed text-ink"
    >
      {active.text}
    </p>
  );
}
