import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch } from '../hooks/useSearch';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FiSearch, FiX, FiPlay, FiImage, FiMusic, FiFile } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';

interface SearchBarProps {
  onSearch?: (query: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initialQuery?: string;
}

// Helper function to highlight matched text with context
function HighlightText({ text, searchQuery, maxLength = 150 }: { text: string; searchQuery: string; maxLength?: number }) {
  if (!searchQuery.trim() || !text) return <>{text}</>;

  // Find the position of the search query
  const index = text.toLowerCase().indexOf(searchQuery.toLowerCase());
  if (index === -1) return <>{text}</>;

  // Calculate the context window
  const contextLength = Math.floor((maxLength - searchQuery.length) / 2);
  let start = Math.max(0, index - contextLength);
  let end = Math.min(text.length, index + searchQuery.length + contextLength);

  // Adjust if we have room to show more context on either side
  if (start > 0 && end < text.length) {
    // We're truncating both sides
    const textToShow = text.slice(start, end);
    const parts = textToShow.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        …{parts.map((part, i) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">{part}</mark>
          ) : (
            part
          )
        )}…
      </>
    );
  } else if (start > 0) {
    // Only truncating the start
    const textToShow = text.slice(start);
    const parts = textToShow.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        …{parts.map((part, i) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  } else if (end < text.length) {
    // Only truncating the end
    const textToShow = text.slice(0, end);
    const parts = textToShow.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">{part}</mark>
          ) : (
            part
          )
        )}…
      </>
    );
  }

  // No truncation needed
  const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function SearchBar({ 
  onSearch, 
  className = '', 
  placeholder = 'Search media...', 
  autoFocus = false,
  initialQuery = ''
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const searchBarRef = useRef<HTMLDivElement>(null);
  
  // Refs for debouncing and cancellation
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController>();
  const lastSearchQueryRef = useRef<string>('');
  
  const { 
    search, 
    searchResults,
    suggestions,
    loading 
  } = useSearch();

  // Debounced search function
  const debouncedSearch = useCallback(async (searchQuery: string) => {
    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if query is too short or same as last search
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setShowResults(false);
      setIsSearching(false);
      return;
    }

    // Don't search if it's the same query as last time
    if (searchQuery === lastSearchQueryRef.current) {
      return;
    }

    // Set debounce timeout
    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        
        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();
        
        // Update last search query
        lastSearchQueryRef.current = searchQuery;
        
        await search(searchQuery, { 
          limit: 5,
          includePrivate: !!user 
        });
        
        setShowResults(true);
      } catch (error) {
        // Only show error if it's not an abort error
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Search error:', error);
        }
      } finally {
        setIsSearching(false);
      }
    }, 400); // 300ms debounce delay
  }, [search, user]);

  // Handle search input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.trim()) {
      debouncedSearch(value);
    } else {
      // Clear results immediately for empty query
      setShowResults(false);
      setIsSearching(false);
      lastSearchQueryRef.current = '';
      
      // Cancel any pending search
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  };

  // Handle search submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // Cancel any pending debounced search
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      setShowResults(false);
      if (onSearch) {
        onSearch(query);
      } else {
        navigate(`/search?q=${encodeURIComponent(query)}`);
      }
    }
  };

  // Handle result click
  const handleResultClick = (id: string) => {
    setShowResults(false);
    navigate(`/watch/${id}`);
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowResults(false);
    if (onSearch) {
      onSearch(suggestion);
    } else {
      navigate(`/search?q=${encodeURIComponent(suggestion)}`);
    }
  };

  // Get media type icon
  const getMediaIcon = (mimeType: string) => {
    if (mimeType.startsWith('video/')) return <FiPlay className="w-4 h-4" />;
    if (mimeType.startsWith('image/')) return <FiImage className="w-4 h-4" />;
    if (mimeType.startsWith('audio/')) return <FiMusic className="w-4 h-4" />;
    return <FiFile className="w-4 h-4" />;
  };

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update query when initialQuery changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div ref={searchBarRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="w-full px-4 py-2 pl-10 pr-10 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
          />
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setShowResults(false);
                lastSearchQueryRef.current = '';
                if (debounceTimeoutRef.current) {
                  clearTimeout(debounceTimeoutRef.current);
                }
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <FiX />
            </button>
          )}
        </div>
      </form>

      {/* Search results dropdown */}
      {showResults && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {/* Loading state */}
          {(loading || isSearching) && (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600 mx-auto"></div>
              <div className="text-xs text-gray-500 mt-1">Searching...</div>
            </div>
          )}

          {/* Results */}
          {!loading && !isSearching && searchResults?.items.length === 0 && suggestions.length === 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No results found
            </div>
          )}

          {/* Media results */}
          {searchResults?.items.map(item => (
            <button
              key={item.id}
              onClick={() => handleResultClick(item.id)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {getMediaIcon(item.files[0]?.mimeType || '')}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  <HighlightText text={item.title} searchQuery={query} maxLength={100} />
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {item.user?.displayName} • {formatDistanceToNow(new Date(item.createdAt))} ago
                </p>
                {/* Show matching caption if available */}
                {item.caption_match && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    <span className="font-medium mr-1">Caption:</span>
                    <HighlightText text={item.caption_match} searchQuery={query} maxLength={100} />
                  </p>
                )}
              </div>
            </button>
          ))}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <>
              {searchResults?.items.length > 0 && (
                <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                  Suggestions
                </div>
              )}
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <FiSearch className="w-4 h-4 text-gray-400" />
                    <span>{suggestion}</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* View all results */}
          {(searchResults?.total || 0) > 5 && (
            <button
              onClick={() => {
                setShowResults(false);
                navigate(`/search?q=${encodeURIComponent(query)}`);
              }}
              className="w-full px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium border-t border-gray-200 dark:border-gray-700"
            >
              View all {searchResults?.total} results
            </button>
          )}
        </div>
      )}
    </div>
  );
} 