import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SearchResults, SearchSuggestion } from '@/lib/types';

/**
 * Search data layer.
 *
 * Kept out of `features/media/api.ts` because search is its own concern with its
 * own cache lifecycle: results are keyed by their term and shouldn't be
 * invalidated by an unrelated media mutation... except that deleting an item
 * *should* drop it from results, so `mediaKeys.all` invalidation already covers
 * search by prefix (`['media']` vs `['search']` don't overlap — deletion is
 * handled by the explicit invalidation below).
 */

export const SEARCH_PAGE_SIZE = 24;

export const searchKeys = {
  all: ['search'] as const,
  results: (term: string, page: number) => ['search', 'results', term, page] as const,
  suggestions: (term: string) => ['search', 'suggestions', term] as const,
};

export function useSearchResults(term: string, page: number) {
  const q = term.trim();

  return useQuery({
    queryKey: searchKeys.results(q, page),
    // An empty term is a legitimate state (the page's initial view), not an
    // error — so don't fetch rather than asking the API for nothing.
    enabled: q.length > 0,
    // Keeps the previous page on screen while the next one loads, instead of
    // flashing a spinner and collapsing the layout on every keystroke.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const envelope = await api.get<SearchResults>(
        `/search?q=${encodeURIComponent(q)}&page=${page}&limit=${SEARCH_PAGE_SIZE}`,
      );
      return envelope.data;
    },
  });
}

/** Typeahead. Two characters is the point where suggestions stop being noise. */
export function useSearchSuggestions(term: string) {
  const q = term.trim();

  return useQuery({
    queryKey: searchKeys.suggestions(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const envelope = await api.get<{ suggestions: SearchSuggestion[] }>(
        `/search/suggestions?q=${encodeURIComponent(q)}&limit=8`,
      );
      return envelope.data.suggestions;
    },
  });
}
