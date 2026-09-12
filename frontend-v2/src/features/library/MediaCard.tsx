import { Link } from 'react-router-dom';
import { FileAudio, FileVideo, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatBytes, formatDuration, formatRelative, mediaKind } from '@/lib/format';
import type { CaptionStatus, MediaItem } from '@/lib/types';

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

export function MediaCard({ item, onDelete }: { item: MediaItem; onDelete: (item: MediaItem) => void }) {
  const file = item.files[0];
  const kind = mediaKind(file?.mimeType);
  const Icon = KIND_ICONS[kind];
  const status = STATUS_TONES[item.captionStatus];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <Link to={`/watch/${item.id}`} className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
            <Icon className="size-5" />
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="min-w-0">
          <h3 className="truncate font-display text-base text-ink" title={item.title}>
            {item.title}
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
                {tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[11px] text-ink-faint">+{item.tags.length - 3}</span>
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
