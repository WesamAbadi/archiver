import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileAudio, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/toast';
import { formatBytes, formatDate, formatDuration, mediaKind } from '@/lib/format';
import { ApiError } from '@/lib/api';
import {
  useCaptionStatus,
  useCaptions,
  useDeleteCaption,
  useDeleteMedia,
  useGenerateCaptions,
  useMediaItem,
  usePlaybackUrl,
} from '@/features/media/api';
import { ActiveCaption, TranscriptPanel } from './TranscriptPanel';

export function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const item = useMediaItem(id);
  const file = item.data?.files[0];
  const playback = usePlaybackUrl(id, file?.id);

  const captions = useCaptions(id);
  const caption = captions.data?.[0];

  const inFlight =
    item.data?.captionStatus === 'QUEUED' || item.data?.captionStatus === 'PROCESSING';
  const status = useCaptionStatus(id, Boolean(inFlight));

  const generate = useGenerateCaptions(id ?? '');
  const deleteCaption = useDeleteCaption(id ?? '');
  const deleteItem = useDeleteMedia();

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [confirmItemDelete, setConfirmItemDelete] = useState(false);

  // Playhead state lives here rather than inside the transcript, so the panel
  // and the player can never disagree about where playback is.
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;

    function onTimeUpdate() {
      setCurrentTime(element?.currentTime ?? 0);
    }
    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('seeked', onTimeUpdate);
    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('seeked', onTimeUpdate);
    };
  }, [playback.data?.url]);

  // When a transcription run finishes, refresh the item so the status badge and
  // transcript update without a manual reload.
  useEffect(() => {
    const nextStatus = status.data?.captionStatus;
    if (nextStatus && nextStatus !== 'QUEUED' && nextStatus !== 'PROCESSING') {
      void item.refetch();
      void captions.refetch();
    }
  }, [status.data?.captionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  function seek(seconds: number) {
    const element = mediaRef.current;
    if (!element) return;
    element.currentTime = seconds;
    setCurrentTime(seconds);
  }

  async function handleRegenerate() {
    try {
      await generate.mutateAsync();
      toast.success('Transcription queued.');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not queue transcription.',
      );
    }
  }

  async function handleDeleteCaption() {
    if (!caption) return;
    try {
      await deleteCaption.mutateAsync(caption.id);
      toast.success('Transcript deleted.');
    } catch {
      toast.error('Could not delete the transcript.');
    }
  }

  async function handleDeleteItem() {
    if (!id) return;
    try {
      await deleteItem.mutateAsync(id);
      toast.success('Item deleted.');
      navigate('/library', { replace: true });
    } catch {
      toast.error('Could not delete this item.');
    }
  }

  if (item.isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6 text-accent" label="Loading item" />
      </div>
    );
  }

  if (item.isError || !item.data) {
    return (
      <EmptyState
        title="Item not found"
        description={
          item.error instanceof Error ? item.error.message : 'This item is not in the archive.'
        }
        action={
          <Link to="/library">
            <Button variant="secondary">Back to the library</Button>
          </Link>
        }
      />
    );
  }

  const media = item.data;
  const kind = mediaKind(file?.mimeType);
  const isVideo = kind === 'video';
  const segments = caption?.segments ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/library"
          className="inline-flex items-center gap-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Library
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {segments.length > 0 && (
            <Link to={`/watch/${media.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Pencil className="size-4" />
                Edit transcript
              </Button>
            </Link>
          )}

          <Button
            variant="secondary"
            size="sm"
            loading={generate.isPending}
            disabled={inFlight}
            onClick={handleRegenerate}
          >
            <RefreshCw className="size-4" />
            {segments.length > 0 ? 'Re-transcribe' : 'Transcribe'}
          </Button>

          <Button variant="danger" size="sm" onClick={() => setConfirmItemDelete(true)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <h1 className="font-display text-2xl text-ink">{media.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={media.captionStatus === 'FAILED' ? 'danger' : 'neutral'}>
              {media.captionStatus.toLowerCase()}
            </Badge>
            <span className="font-mono text-[11px] text-ink-faint">
              {formatDuration(media.duration)} · {formatBytes(media.size)}
              {media.format ? ` · ${media.format.toUpperCase()}` : ''}
            </span>
          </div>

          {/* ── Player ───────────────────────────────────────────────────── */}
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
            {playback.isPending ? (
              <div
                className={
                  isVideo
                    ? 'flex aspect-video items-center justify-center'
                    : 'flex h-40 items-center justify-center'
                }
              >
                <Spinner className="size-6 text-accent" label="Preparing playback" />
              </div>
            ) : playback.isError || !playback.data ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-ink-muted">
                  Playback could not be prepared. The signing credentials may be missing or
                  invalid.
                </p>
                <Button variant="secondary" size="sm" onClick={() => void playback.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {isVideo ? (
                  <video
                    ref={(el) => {
                      mediaRef.current = el;
                    }}
                    src={playback.data.url}
                    controls
                    playsInline
                    className="aspect-video w-full bg-black"
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-4 px-6 py-8">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
                        <FileAudio className="size-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg text-ink">{media.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                          {media.originalTitle ?? file?.originalName ?? 'audio'}
                        </p>
                      </div>
                    </div>
                    <audio
                      ref={(el) => {
                        mediaRef.current = el;
                      }}
                      src={playback.data.url}
                      controls
                      className="w-full"
                    />
                  </>
                )}
              </>
            )}

            {segments.length > 0 && !isVideo && (
              <div className="border-t border-border">
                <ActiveCaption segments={segments} currentTime={currentTime} />
              </div>
            )}
          </div>

          {media.description && (
            <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
              {media.description}
            </p>
          )}

          {media.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {media.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-xs bg-surface-2 px-2 py-1 text-[11px] text-ink-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Transcript / status sidebar ────────────────────────────────── */}
        <aside className="rounded-lg border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="font-display text-base text-ink">Transcript</h2>
            {caption && (
              <button
                type="button"
                onClick={handleDeleteCaption}
                className="text-[11px] text-ink-faint transition-colors hover:text-danger"
              >
                Remove
              </button>
            )}
          </header>

          <div className="max-h-[32rem] overflow-y-auto">
            {inFlight ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Spinner className="size-5 text-accent" />
                <p className="text-sm text-ink">
                  {status.data?.captionStatus === 'PROCESSING' ? 'Transcribing…' : 'Queued…'}
                </p>
                <p className="text-[13px] text-ink-faint">
                  Whisper is working through the file. This panel updates on its own.
                </p>
              </div>
            ) : captions.isPending ? (
              <div className="flex justify-center py-12">
                <Spinner className="size-5 text-accent" />
              </div>
            ) : segments.length > 0 ? (
              <TranscriptPanel segments={segments} currentTime={currentTime} onSeek={seek} />
            ) : media.captionStatus === 'FAILED' ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-danger">Transcription failed.</p>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {media.captionErrorMessage ?? 'No error details were recorded.'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  loading={generate.isPending}
                  onClick={handleRegenerate}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-ink-muted">
                  No transcript yet.
                  {kind !== 'audio' && ' Transcription is available for audio files.'}
                </p>
                {kind === 'audio' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    loading={generate.isPending}
                    onClick={handleRegenerate}
                  >
                    Transcribe this file
                  </Button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-display text-base text-ink">Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
          <Detail label="Added" value={formatDate(media.createdAt)} />
          <Detail label="Duration" value={formatDuration(media.duration)} />
          <Detail label="Size" value={formatBytes(media.size)} />
          <Detail label="Files" value={String(media.files.length)} />
        </dl>
      </section>

      <Modal
        open={confirmItemDelete}
        onClose={() => setConfirmItemDelete(false)}
        title="Delete this item?"
        description="The stored file and its captions are removed. This cannot be undone."
      >
        <p className="text-sm text-ink">{media.title}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmItemDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleteItem.isPending} onClick={handleDeleteItem}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
