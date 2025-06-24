import React, { useState } from 'react'
import { useQuery } from 'react-query'
import { publicAPI } from '../lib/api'
import { TrendingBanner } from '../components/TrendingBanner'
import { MediaCard } from '../components/MediaCard'
import { MediaFilters } from '../components/MediaFilters'
import { Loader2, Zap, Star, Trophy } from 'lucide-react'

export function HomePage() {
  const [selectedType, setSelectedType] = useState<'all' | 'video' | 'audio' | 'image'>('all')

  // Get trending content
  const { data: trendingData } = useQuery(
    'trending',
    () => publicAPI.getTrending({ limit: 10 }),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  )

  // Get main feed content
  const { data: feedData, isLoading } = useQuery(
    ['feed', selectedType],
    () => publicAPI.getFeed({ page: 1, limit: 20, type: selectedType }),
    {
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <Loader2 className="w-12 h-12 animate-spin text-[var(--accent-blue)] mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-[var(--accent-purple)]/20 rounded-full animate-ping mx-auto"></div>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Loading ArchiveDrop</h2>
          <p className="text-[var(--text-secondary)]">Discovering amazing content...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-blue)]/10 via-[var(--accent-purple)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Zap className="w-8 h-8 text-[var(--accent-blue)]" />
              <h1 className="text-4xl md:text-6xl font-bold text-gradient">
                ArchiveDrop
              </h1>
              <Star className="w-6 h-6 text-[var(--accent-purple)] animate-pulse" />
            </div>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Discover, archive, and share content from across the web. 
              <span className="text-[var(--accent-blue)] font-semibold"> Your digital vault awaits.</span>
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="card-gaming text-center p-4">
              <div className="text-2xl font-bold text-[var(--accent-blue)] mb-1">2.4k+</div>
              <div className="text-sm text-[var(--text-secondary)]">Videos</div>
            </div>
            <div className="card-gaming text-center p-4">
              <div className="text-2xl font-bold text-[var(--accent-purple)] mb-1">1.8k+</div>
              <div className="text-sm text-[var(--text-secondary)]">Audio</div>
            </div>
            <div className="card-gaming text-center p-4">
              <div className="text-2xl font-bold text-[var(--accent-green)] mb-1">892+</div>
              <div className="text-sm text-[var(--text-secondary)]">Images</div>
            </div>
            <div className="card-gaming text-center p-4">
              <div className="text-2xl font-bold text-[var(--accent-red)] mb-1">5.1k+</div>
              <div className="text-sm text-[var(--text-secondary)]">Total</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Trending Section */}
        {trendingData?.data?.data && Array.isArray(trendingData.data.data) && trendingData.data.data.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center space-x-2 mb-6">
              <Trophy className="w-6 h-6 text-[var(--accent-orange)]" />
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Trending Right Now</h2>
              <div className="bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] px-2 py-1 rounded-full text-sm font-medium">
                🔥 Hot
              </div>
            </div>
            <TrendingBanner items={trendingData.data.data} />
          </div>
        )}

        {/* Content Filters */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Discover Content</h2>
          <MediaFilters
            activeFilter={selectedType}
            onFilterChange={setSelectedType}
          />
        </div>

        {/* Content Grid */}
        {feedData?.data?.data ? (
          <>
            {feedData.data.data.items && feedData.data.data.items.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {feedData.data.data.items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    variant="gaming"
                    showUploader={true}
                    showEngagement={true}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="card-gaming p-8 max-w-md mx-auto">
                  <div className="text-6xl mb-4">🎮</div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    No Content Yet
                  </h3>
                  <p className="text-[var(--text-secondary)] mb-4">
                    Be the first to upload {selectedType === 'all' ? 'content' : selectedType} to ArchiveDrop!
                  </p>
                  <div className="text-sm text-[var(--text-muted)]">
                    Upload from YouTube, SoundCloud, Twitter, or direct files
                  </div>
                </div>
              </div>
            )}

            {/* Load More */}
            {feedData.data.data.pagination?.hasMore && (
              <div className="text-center mt-12">
                <button className="btn btn-secondary">
                  <Loader2 className="w-4 h-4 mr-2" />
                  Load More Content
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <div className="card-gaming p-8 max-w-md mx-auto">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-blue)] mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                Loading Content
              </h3>
              <p className="text-[var(--text-secondary)]">
                Fetching the latest uploads...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 