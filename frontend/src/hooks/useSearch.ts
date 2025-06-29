import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { searchAPI } from '../lib/api';
import type { MediaItem, SearchResult } from '../lib/api';
import debounce from 'lodash/debounce';

interface SearchOptions {
  includePrivate?: boolean;
  limit?: number;
  offset?: number;
}

interface UseSearchResult {
  search: (query: string, options?: SearchOptions) => Promise<void>;
  searchResults: SearchResult | null;
  suggestions: string[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useSearch(): UseSearchResult {
  const { user } = useAuth();
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentOptions, setCurrentOptions] = useState<SearchOptions>({});

  // Refs for request cancellation
  const searchAbortControllerRef = useRef<AbortController>();
  const suggestionsAbortControllerRef = useRef<AbortController>();

  // Debounced function to fetch search suggestions
  const debouncedFetchSuggestions = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }

      try {
        // Cancel previous suggestions request
        if (suggestionsAbortControllerRef.current) {
          suggestionsAbortControllerRef.current.abort();
        }

        // Create new abort controller
        suggestionsAbortControllerRef.current = new AbortController();

        const response = await searchAPI.getSuggestions({ q: query }, suggestionsAbortControllerRef.current.signal);
        setSuggestions(response.data);
      } catch (error) {
        // Only log error if it's not an abort error
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch suggestions:', error);
        }
      }
    }, 300),
    []
  );

  // Function to perform the search
  const search = async (query: string, options: SearchOptions = {}) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSuggestions([]);
      return;
    }

    // Cancel previous search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    // Create new abort controller
    searchAbortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setCurrentQuery(query);
    setCurrentOptions(options);

    try {
      // Only include private results if user is authenticated
      const searchOptions = {
        q: query,
        ...options,
        includePrivate: user ? options.includePrivate : false
      };

      const response = await searchAPI.search(searchOptions, searchAbortControllerRef.current.signal);
      setSearchResults(response.data);
      
      // Fetch suggestions for the search query
      debouncedFetchSuggestions(query);
    } catch (error) {
      // Only show error if it's not an abort error
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Search error:', error);
        setError('Failed to perform search');
        setSearchResults(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Function to load more results
  const loadMore = async () => {
    if (!searchResults || !searchResults.hasMore || loading) return;

    const nextOffset = (currentOptions.offset || 0) + (currentOptions.limit || 20);
    setLoading(true);

    try {
      const response = await searchAPI.search({
        q: currentQuery,
        ...currentOptions,
        offset: nextOffset,
        includePrivate: user ? currentOptions.includePrivate : false
      });
      
      setSearchResults(prev => ({
        items: [...(prev?.items || []), ...response.data.items],
        total: response.data.total,
        hasMore: response.data.hasMore
      }));

      setCurrentOptions({ ...currentOptions, offset: nextOffset });
    } catch (error) {
      console.error('Load more error:', error);
      setError('Failed to load more results');
    } finally {
      setLoading(false);
    }
  };

  // Cleanup debounced function and abort controllers on unmount
  useEffect(() => {
    return () => {
      debouncedFetchSuggestions.cancel();
      
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      
      if (suggestionsAbortControllerRef.current) {
        suggestionsAbortControllerRef.current.abort();
      }
    };
  }, [debouncedFetchSuggestions]);

  return {
    search,
    searchResults,
    suggestions,
    loading,
    error,
    hasMore: searchResults?.hasMore || false,
    loadMore
  };
} 