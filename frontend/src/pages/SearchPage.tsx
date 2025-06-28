import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/useSearch';
import { useAuth } from '../contexts/AuthContext';
import { SearchBar } from '../components/SearchBar';
import { MediaGrid } from '../components/MediaGrid';
import { useInView } from 'react-intersection-observer';
import { PageContainer, Card } from '../components/common';
import { Search, Loader2 } from 'lucide-react';

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
    <PageContainer variant="default">
      {/* Search Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-purple)]/10 via-[var(--accent-blue)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
          <div className="flex items-center space-x-3 mb-6">
            <Search className="w-8 h-8 text-[var(--accent-purple)]" />
            <h1 className="text-4xl md:text-5xl font-bold text-gradient">
              Search
            </h1>
          </div>
          
          {/* Search bar */}
          <div className="max-w-2xl">
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search by title, description, or captions..."
              className="w-full"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {query && (
          <div>
            {/* Results header */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                {searchResults ? (
                  <>
                    {searchResults.total} results for "{query}"
                  </>
                ) : loading ? (
                  'Searching...'
                ) : (
                  'No results found'
                )}
              </h2>
            </div>

            {/* Results grid */}
            {searchResults?.items && searchResults.items.length > 0 && (
              <Card variant="default" className="p-6">
                <MediaGrid items={searchResults.items} />
              </Card>
            )}

            {/* Loading state */}
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-blue)]" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <Card variant="hover" className="p-6 border-[var(--accent-red)]/20">
                <div className="text-center text-[var(--accent-red)]">
                  {error}
                </div>
              </Card>
            )}

            {/* Load more trigger */}
            {hasMore && <div ref={loadMoreRef} className="h-10" />}

            {/* No results */}
            {!loading && searchResults?.items.length === 0 && (
              <Card variant="hover" className="p-8 text-center">
                <Search className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
                <p className="text-[var(--text-secondary)]">
                  No results found for "{query}". Try different keywords or check your spelling.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Empty state */}
        {!query && (
          <Card variant="hover" className="p-8 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
            <p className="text-[var(--text-secondary)]">
              Enter a search term to find media items.
            </p>
          </Card>
        )}
      </div>
    </PageContainer>
  );
} 