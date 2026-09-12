import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { MediaCard } from '@/features/library/MediaCard';
import type { MediaItem } from '@/lib/types';
import { useSearchResults } from './api';

/**
 * Results for the current query, shown on the home page in place of the library
 * grid rather than on a route of its own.
 *
 * `term` and `page` come from the page (which reads the URL), not from state
 * here, so the component stays a pure function of "what is being searched" and
 * re-renders correctly when the URL changes underneath it. The card is the
 * library's own `MediaCard` — a hit just also has `match` to show why it
 * matched, including the lyric and where to jump to.
 */
export function SearchResults({
  term,
  page,
  onPageChange,
  onClear,
  onDelete,
}: {
  term: string;
  page: number;
  onPageChange: (page: number) => void;
  onClear: () => void;
  /** Omitted for visitors, who cannot delete anything. */
  onDelete?: (item: MediaItem) => void;
}) {
  const results = useSearchResults(term, page);

  if (results.isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6 text-accent" label="Searching" />
      </div>
    );
  }

  if (results.isError) {
    return (
      <EmptyState
        icon={<SearchX className="size-5" />}
        title="Search failed"
        description={
          results.error instanceof Error ? results.error.message : 'The API did not respond.'
        }
        action={
          <Button variant="secondary" onClick={() => void results.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-5" />}
        title={`Nothing matches “${term}”`}
        description="Try fewer words, or a word from the lyrics rather than the title."
        action={
          <Button variant="secondary" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
        {total} {total === 1 ? 'result' : 'results'} for{' '}
        <span className="text-ink">“{term}”</span>
      </p>

      <div
        className={cn(
          'grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3',
          // Keep the previous page visible but muted while the next loads.
          results.isPlaceholderData && 'opacity-60',
        )}
      >
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            match={item.match}
            term={term}
            onDelete={onDelete}
          />
        ))}
      </div>

      {results.data && results.data.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <span className="font-mono text-[13px] text-ink-muted">
            {page} / {results.data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= results.data.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
