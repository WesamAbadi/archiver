import { Link } from 'react-router-dom';
import { FileAudio, FileVideo, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Highlight } from '@/components/ui/Highlight';
import { formatBytes, formatDuration, formatRelative, formatTimecode, mediaKind } from '@/lib/format';
import { dirProps } from '@/lib/rtl';
import type { CaptionStatus, MediaItem, SearchMatch, SearchMatchField } from '@/lib/types';

const KIND_ICONS = {
  audio: FileAudio,
  video: FileVideo,
  image: ImageIcon,
  other: FileAudio,
} as const;

/**
 * One status → one badge. The old UI derived this in three components with
 * different label sets ("Processing", "In progress", "Generating…"), so the
 * same item described itself differently depending on the screen.
 */
const STATUS_TONES: Record<CaptionStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: 'neutral', label: 'No captions' },
  QUEUED: { tone: 'info', label: 'Queued' },
  PROCESSING: { tone: 'warning', label: 'Transcribing' },
  COMPLETED: { tone: 'success', label: 'Captions' },
  FAILED: { tone: 'danger', label: 'Failed' },
  SKIPPED: { tone: 'neutral', label: 'Not applicable' },
};

const MATCH_LABELS: Record<SearchMatchField, string> = {
  title: 'title',
  tags: 'tags',
  description: 'description',
  lyrics: 'lyrics',
};

/**
 * One item, in the library grid and in search results alike.
 *
 * `match` is the only thing search adds. Deliberately the same component, not a
 * parallel "search result card": the old frontend had a card per screen and they
 * drifted (different badges, different metadata, one of them silently missing
 * the delete button).
 *
 * When the match is in the lyrics, the whole card links to the moment in the
 * track rather than the top of it. That's also why the snippet is plain text and
 * not its own link — a link inside a link is invalid, and picking one target is
 * better than two competing ones.
 */
export function MediaCard({
  item,
  onDelete,
  match,
  term,
}: {
  item: MediaItem;
  onDelete: (item: MediaItem) => void;
  /** Present only in search results. */
  match?: SearchMatch;
  /** The user's search term, for highlighting. */
  term?: string;
}) {
  const file = item.files[0];
  const kind = mediaKind(file?.mimeType);
  const Icon = KIND_ICONS[kind];
  const status = STATUS_TONES[item.captionStatus];
  const lyric = match?.lyric ?? null;
  const target = lyric ? `/watch/${item.id}?t=${lyric.startTime}` : `/watch/${item.id}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <Link to={target} className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
            <Icon className="size-5" />
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="min-w-0">
          <h3 className="truncate font-display text-base text-ink" title={item.title}>
            {term ? <Highlight text={item.title} term={term} /> : item.title}
          </h3>
          <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
            {formatDuration(item.duration)} · {formatBytes(item.size)}
            {item.format ? ` · ${item.format.toUpperCase()}` : ''}
          </p>
        </div>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted"
              >
                {term ? <Highlight text={tag} term={term} /> : tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[11px] text-ink-faint">+{item.tags.length - 3}</span>
            )}
          </div>
        )}

        {match && (
          <div className="mt-1 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {match.fields.map((field) => (
                <span
                  key={field}
                  className="rounded-xs border border-accent-dim/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent"
                >
                  {MATCH_LABELS[field]}
                </span>
              ))}
            </div>

            {lyric && (
              <p
                className="mt-2 text-[13px] leading-relaxed text-ink-muted"
                {...dirProps(lyric.text)}
              >
                <span className="mr-1.5 font-mono text-[11px] align-middle text-accent">
                  {formatTimecode(lyric.startTime)}
                </span>
                <Highlight text={lyric.text} term={term ?? ''} />
              </p>
            )}
          </div>
        )}

        <p className="mt-auto text-[11px] text-ink-faint">{formatRelative(item.createdAt)}</p>
      </Link>

      <button
        type="button"
        onClick={() => onDelete(item)}
        aria-label={`Delete ${item.title}`}
        className="absolute right-3 top-3 rounded-sm bg-surface-2/90 p-2 text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </article>
  );
}
