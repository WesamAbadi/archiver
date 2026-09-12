import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/useDebounced';
import { useSearchSuggestions } from './api';

/**
 * The archive's search box — the main way in besides browsing.
 *
 * It owns the `?q=` parameter itself, which is why it takes no props: the page
 * that renders it only reads the query, and the box owns getting it there. The
 * input is local state so typing stays responsive, debounced into the URL 300ms
 * after the last keystroke. Keeping the term in the URL is what makes a result
 * view linkable, shareable and refreshable, and lets the back button work —
 * all of which a page-local `useState` would quietly lose.
 */
export function SearchBar() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';

  const [input, setInput] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounced = useDebounced(input, 300);
  const suggestions = useSearchSuggestions(open ? input : '');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

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

  return (
    <div className="relative w-full max-w-2xl">
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
          ) : suggestions.isFetching && input.trim() ? (
            <Loader2 className="mr-2 size-4 animate-spin text-ink-faint" aria-hidden />
          ) : undefined
        }
        autoComplete="off"
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
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
  );
}
