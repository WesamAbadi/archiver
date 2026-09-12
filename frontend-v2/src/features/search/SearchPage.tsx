import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Search, SearchX, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/useDebounced';
import { useDeleteMedia } from '@/features/media/api';
import { MediaCard } from '@/features/library/MediaCard';
import type { MediaItem } from '@/lib/types';
import { SEARCH_PAGE_SIZE, useSearchResults, useSearchSuggestions } from './api';

/**
 * Search.
 *
 * The query lives in the URL (`/search?q=…`) rather than component state, so a
 * result view is linkable, survives a refresh, and works with the browser's back
 * button. The input is local state only so typing stays responsive; it's
 * debounced into the URL 300ms after the last keystroke.
 *
 * The backend does the matching (including across transcripts) — the old app
 * filtered whatever array happened to be loaded in the browser, so "search"
 * only ever covered the current page.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';

  const [input, setInput] = useState(urlQuery);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);

  const debounced = useDebounced(input, 300);
  const results = useSearchResults(urlQuery, page);
  const suggestions = useSearchSuggestions(open ? input : '');
  const deleteMedia = useDeleteMedia();

  const listboxId = useId();
  const blurTimer = useRef<number | undefined>(undefined);

  // Don't leave a pending timer that closes a list on an unmounted component.
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  // Push the debounced input into the URL. `replace` so typing doesn't stack up
  // a history entry per keystroke and trap the back button.
  useEffect(() => {
    const next = debounced.trim();
    if (next === urlQuery) return;

    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set('q', next);
    else nextParams.delete('q');
    setParams(nextParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Reflect external URL changes (a link, back/forward) into the input without
  // fighting the user: only when it disagrees with what was typed.
  useEffect(() => {
    if (urlQuery !== debounced.trim()) setInput(urlQuery);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const options = suggestions.data ?? [];
  const showSuggestions = open && options.length > 0;

  function chooseSuggestion(value: string) {
    setInput(value);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showSuggestions) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      // Only intercept Enter when an option is highlighted — otherwise let the
      // URL sync do its work so Enter just searches the typed term.
      event.preventDefault();
      const option = options[activeIndex];
      if (option) chooseSuggestion(option.value);
    }
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

  const trimmed = urlQuery.trim();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink">Search</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Titles, tags, descriptions and full transcripts — in Arabic and English.
        </p>
      </header>

      <div className="relative mb-8 max-w-2xl">
        <TextField
          label="Search the archive"
          hideLabel
          placeholder="Search titles, tags and lyrics…"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          // Delay closing so a click on a suggestion lands before the list
          // unmounts — otherwise the option vanishes mid-click.
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          leading={<Search className="size-4" />}
          trailing={
            input ? (
              <button
                type="button"
                onClick={() => {
                  setInput('');
                  setActiveIndex(-1);
                }}
                aria-label="Clear search"
                className="rounded-sm p-1.5 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : results.isFetching && trimmed ? (
              <Loader2 className="mr-2 size-4 animate-spin text-ink-faint" aria-hidden />
            ) : undefined
          }
          autoComplete="off"
          autoFocus
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
        />

        {showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Suggestions"
            className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          >
            {options.map((option, index) => (
              <li
                key={`${option.kind}-${option.value}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  // mousedown, not click: click fires after blur has already
                  // closed the list.
                  event.preventDefault();
                  window.clearTimeout(blurTimer.current);
                  chooseSuggestion(option.value);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm',
                  index === activeIndex ? 'bg-surface-2 text-ink' : 'text-ink-muted',
                )}
              >
                <span className="truncate">{option.value}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  {option.kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!trimmed ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="Search the whole archive"
          description="Matches titles, tags, descriptions and every transcribed line. Searching a lyric finds the track and the moment it is sung."
        />
      ) : results.isPending ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="size-6 text-accent" label="Searching" />
        </div>
      ) : results.isError ? (
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={`Nothing matches “${trimmed}”`}
          description="Try fewer words, or a word from the lyrics rather than the title."
          action={
            <Button variant="secondary" onClick={() => setInput('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
            {total} {total === 1 ? 'result' : 'results'} for{' '}
            <span className="text-ink">“{trimmed}”</span>
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
                term={trimmed}
                onDelete={setPendingDelete}
              />
            ))}
          </div>

          {results.data && results.data.totalPages > 1 && (
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
                {page} / {results.data.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= results.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          )}

          {total > SEARCH_PAGE_SIZE && (
            <p className="mt-4 text-center text-[12px] text-ink-faint">
              <Link to="/library" className="underline decoration-border hover:text-ink">
                Browse the library instead
              </Link>
            </p>
          )}
        </>
      )}

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
