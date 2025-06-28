import { useState, useEffect, useCallback } from 'react';
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
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentOptions, setCurrentOptions] = useState<SearchOptions>({});

  // Debounced function to fetch search suggestions
  const debouncedFetchSuggestions = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await searchAPI.getSuggestions({ q: query });
        setSuggestions(response.data);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
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

    setLoading(true);
    setError(null);
    setCurrentQuery(query);
    setCurrentOptions(options);

    try {
      const response = await searchAPI.search({
        q: query,
        ...options
      });
      setSearchResults(response.data);
      
      // Fetch suggestions for the search query
      debouncedFetchSuggestions(query);
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to perform search');
      setSearchResults(null);
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
        offset: nextOffset
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

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedFetchSuggestions.cancel();
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