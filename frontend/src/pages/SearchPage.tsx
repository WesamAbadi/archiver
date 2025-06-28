import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/useSearch';
import { useAuth } from '../contexts/AuthContext';
import { SearchBar } from '../components/SearchBar';
import { MediaGrid } from '../components/MediaGrid';
import { useInView } from 'react-intersection-observer';

export function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = new URLSearchParams(location.search).get('q') || '';
  
  const { 
    search, 
    searchResults, 
    loading, 
    error, 
    hasMore, 
    loadMore 
  } = useSearch();

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false
  });

  // Perform initial search
  useEffect(() => {
    if (query) {
      search(query, {
        limit: 20,
        includePrivate: !!user
      });
    }
  }, [query, user]);

  // Load more when scrolling to bottom
  useEffect(() => {
    if (inView && hasMore && !loading) {
      loadMore();
    }
  }, [inView, hasMore, loading]);

  // Handle new search
  const handleSearch = (newQuery: string) => {
    navigate(`/search?q=${encodeURIComponent(newQuery)}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search bar */}
      <div className="mb-8">
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search by title, description, or captions..."
          className="max-w-2xl mx-auto"
          autoFocus
        />
      </div>

      {/* Search results */}
      {query && (
        <div>
          {/* Results header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {searchResults ? (
                <>
                  {searchResults.total} results for "{query}"
                </>
              ) : loading ? (
                'Searching...'
              ) : (
                'No results found'
              )}
            </h1>
          </div>

          {/* Results grid */}
          {searchResults?.items && searchResults.items.length > 0 && (
            <MediaGrid items={searchResults.items} />
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600"></div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-center py-8 text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Load more trigger */}
          {hasMore && <div ref={loadMoreRef} className="h-10" />}

          {/* No results */}
          {!loading && searchResults?.items.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                No results found for "{query}". Try different keywords or check your spelling.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!query && (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            Enter a search term to find media items.
          </p>
        </div>
      )}
    </div>
  );
} 