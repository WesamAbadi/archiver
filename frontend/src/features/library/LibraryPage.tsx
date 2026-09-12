import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LibraryBig, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/toast';
import { useDeleteMedia, useMediaList } from '@/features/media/api';
import type { CaptionStatus, MediaItem } from '@/lib/types';
import { MediaCard } from './MediaCard';
import { UploadDialog } from './UploadDialog';

const PAGE_SIZE = 24;

const FILTERS: { id: 'all' | 'ready' | 'working' | 'issues'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'With captions' },
  { id: 'working', label: 'Transcribing' },
  { id: 'issues', label: 'Needs attention' },
];

function matchesFilter(status: CaptionStatus, filter: string): boolean {
  switch (filter) {
    case 'ready':
      return status === 'COMPLETED';
    case 'working':
      return status === 'QUEUED' || status === 'PROCESSING';
    case 'issues':
      return status === 'FAILED';
    default:
      return true;
  }
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);

  const list = useMediaList(page, PAGE_SIZE);
  const deleteMedia = useDeleteMedia();

  /**
   * Status filtering is still client-side, over the page on screen, and the
   * group is labelled that way. Text search is NOT: the box below hands off to
   * /search, which runs in Postgres across the whole archive — including inside
   * transcripts. Filtering 24 loaded rows and calling it search was the old
   * behaviour, and it only ever told you about the page you were already on.
   */
  const visible = useMemo(
    () => (list.data?.items ?? []).filter((item) => matchesFilter(item.captionStatus, filter)),
    [list.data, filter],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = term.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteMedia.mutateAsync(pendingDelete.id);
      toast.success(`Deleted “${pendingDelete.title}”.`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this item.');
    }
  }

  const pagination = list.data?.pagination;
  const hasItems = (list.data?.items.length ?? 0) > 0;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Library</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {pagination
              ? `${pagination.total} ${pagination.total === 1 ? 'item' : 'items'} archived`
              : 'Your private collection'}
          </p>
        </div>

        <Button variant="primary" onClick={() => setUploadOpen(true)}>
          <Plus className="size-4" />
          Add media
        </Button>
      </header>

      {hasItems && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <form onSubmit={submitSearch} className="sm:max-w-xs sm:flex-1">
            <TextField
              label="Search the archive"
              hideLabel
              placeholder="Search titles and lyrics…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              leading={<Search className="size-4" />}
              aria-label="Search the archive"
              hint="Press Enter to search everything, including lyrics."
            />
          </form>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter this page by status">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={cn(
                  'rounded-sm border px-3 py-2 text-[13px] font-medium transition-colors',
                  filter === option.id
                    ? 'border-accent-dim/60 bg-accent/12 text-accent'
                    : 'border-border text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {list.isPending ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="size-6 text-accent" label="Loading library" />
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={<LibraryBig className="size-5" />}
          title="Could not load the library"
          description={
            list.error instanceof Error ? list.error.message : 'The API did not respond.'
          }
          action={
            <Button variant="secondary" onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !hasItems ? (
        <EmptyState
          icon={<LibraryBig className="size-5" />}
          title="The archive is empty"
          description="Upload a recording and it will be transcribed automatically."
          action={
            <Button variant="primary" onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" />
              Add media
            </Button>
          }
        />
      ) : visible.length === 0 ? (          <EmptyState
            icon={<Search className="size-5" />}
            title="Nothing with that status here"
            description="Filters apply to this page only. Use search to look across the whole archive."
            action={
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Clear filter
              </Button>
            }
          />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="font-mono text-[13px] text-ink-muted">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </nav>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this item?"
        description="The stored file and its captions are removed. This cannot be undone."
      >
        <p className="text-sm text-ink">{pendingDelete?.title}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleteMedia.isPending} onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
