import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LibraryBig, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/toast';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useDeleteMedia, useMediaList } from '@/features/media/api';
import { useSession } from '@/features/auth/hooks';
import { SearchBar } from '@/features/search/SearchBar';
import { SearchResults } from '@/features/search/SearchResults';
import type { CaptionStatus, MediaItem } from '@/lib/types';
import { MediaCard } from './MediaCard';
import { UploadDialog } from './UploadDialog';

const PAGE_SIZE = 24;

/**
 * Home — the whole archive, and the search box over it.
 *
 * One page rather than a library page plus a search page, because they were
 * always the same view with the same grid, the same card and the same
 * pagination; the only difference was what filled them. A query swaps the grid
 * for results, and clearing it puts the grid back, so /library is linkable with
 * or without `?q=`.
 *
 * The audience changes what is offered, not what is shown: a visitor browses,
 * searches and plays; the admin additionally uploads, filters by pipeline status
 * and deletes. Those controls are absent for visitors rather than disabled.
 */
export function LibraryPage() {
  const isAdmin = Boolean(useSession());
  const [params, setParams] = useSearchParams();
  const term = (params.get('q') ?? '').trim();
  const searching = term.length > 0;

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);

  useDocumentTitle(searching ? `Search: ${term}` : 'Library');

  // A new query is a new result set — page 3 of the old one is meaningless.
  useEffect(() => setPage(1), [term]);

  const list = useMediaList(page, PAGE_SIZE, !searching);
  const deleteMedia = useDeleteMedia();

  /**
   * Status filtering is client-side and applies to the page on screen, which the
   * group's label says. Text search is deliberately NOT: it runs in Postgres
   * across the whole archive, including inside transcripts. Filtering 24 loaded
   * rows and calling that search was the old behaviour, and it only ever told
   * you about the page you were already on.
   */
  const visible = useMemo(
    () => (list.data?.items ?? []).filter((item) => matchesFilter(item.captionStatus, filter)),
    [list.data, filter],
  );

  function clearSearch() {
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
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

  const pagination = searching ? undefined : list.data?.pagination;
  const hasItems = (list.data?.items.length ?? 0) > 0;

  const subtitle = searching
    ? 'Titles, tags, descriptions and every transcribed line.'
    : pagination
      ? `${pagination.total} ${pagination.total === 1 ? 'item' : 'items'} archived`
      : 'Audio, video and images, with transcripts.';

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Library</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
        </div>

        {isAdmin && (
          <Button variant="primary" onClick={() => setUploadOpen(true)}>
            <Plus className="size-4" />
            Add media
          </Button>
        )}
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchBar />

        {/* Status is pipeline bookkeeping, so the filter is the admin's. A
            visitor can already see each item's state on its card. */}
        {isAdmin && !searching && hasItems && (
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
        )}
      </div>

      {searching ? (
        <SearchResults
          term={term}
          page={page}
          onPageChange={setPage}
          onClear={clearSearch}
          onDelete={isAdmin ? setPendingDelete : undefined}
        />
      ) : list.isPending ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="size-6 text-accent" label="Loading library" />
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={<LibraryBig className="size-5" />}
          title="Could not load the library"
          description={list.error instanceof Error ? list.error.message : 'The API did not respond.'}
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
          description={
            isAdmin
              ? 'Upload a recording and it will be transcribed automatically.'
              : 'Nothing has been added yet.'
          }
          action={
            isAdmin ? (
              <Button variant="primary" onClick={() => setUploadOpen(true)}>
                <Plus className="size-4" />
                Add media
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
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
            <MediaCard
              key={item.id}
              item={item}
              onDelete={isAdmin ? setPendingDelete : undefined}
            />
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

      {isAdmin && <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />}

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
