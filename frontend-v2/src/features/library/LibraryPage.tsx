import { useMemo, useState } from 'react';
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
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);

  const list = useMediaList(page, PAGE_SIZE);
  const deleteMedia = useDeleteMedia();

  /**
   * Search and filtering are client-side over the current page.
   *
   * Deliberate: the API has no search endpoint yet, and pretending to search the
   * whole archive while only filtering 24 loaded rows would be a lie. Filtering
   * what's on screen is honest about its scope.
   */
  const visible = useMemo(() => {
    const items = list.data?.items ?? [];
    const needle = query.trim().toLowerCase();

    return items.filter((item) => {
      if (!matchesFilter(item.captionStatus, filter)) return false;
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [list.data, query, filter]);

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

      {(hasItems || query || filter !== 'all') && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:max-w-xs sm:flex-1">
            <TextField
              label="Search"
              hideLabel
              placeholder="Search titles and tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leading={<Search className="size-4" />}
              aria-label="Search the library"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
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
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="No matches"
          description="Nothing on this page matches your search or filter."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear filters
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
