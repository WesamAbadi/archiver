import React, { useState } from 'react'
import { useQuery } from 'react-query'
import { publicAPI } from '../lib/api'
import { MediaCard } from '../components/MediaCard'
import { MediaFilters } from '../components/MediaFilters'
import { TrendingUp, Crown, Zap, Trophy, Flame } from 'lucide-react'

export function TrendingPage() {
  const [selectedType, setSelectedType] = useState<'all' | 'video' | 'audio' | 'image'>('all')

  const { data, isLoading, error } = useQuery(
    ['trending', selectedType],
    () => publicAPI.getTrending({ limit: 50, type: selectedType }),
    {
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  )

  const trendingItems = data?.data.data || []

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <TrendingUp className="w-12 h-12 animate-bounce text-[var(--accent-orange)] mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-[var(--accent-red)]/20 rounded-full animate-ping mx-auto"></div>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Loading Trending Content</h2>
          <p className="text-[var(--text-secondary)]">Finding the hottest content...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔥</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Unable to Load Trending</h1>
          <p className="text-[var(--text-secondary)]">Something went wrong. Please try again later.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-orange)]/10 via-[var(--accent-red)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <Crown className="w-8 h-8 text-[var(--accent-orange)]" />
              <h1 className="text-4xl md:text-5xl font-bold text-gradient">
                Trending
              </h1>
              <Flame className="w-8 h-8 text-[var(--accent-red)] animate-pulse" />
            </div>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-6">
              Discover the most popular content on ArchiveDrop right now
            </p>
            
            {/* Live Stats */}
            <div className="inline-flex items-center space-x-2 bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/20 rounded-full px-4 py-2">
              <Zap className="w-4 h-4 text-[var(--accent-orange)]" />
              <span className="text-sm font-medium text-[var(--accent-orange)]">
                {trendingItems.length} trending items
              </span>
              <div className="w-2 h-2 bg-[var(--accent-orange)] rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Filters */}
        <div className="mb-8">
          <MediaFilters
            activeFilter={selectedType}
            onFilterChange={setSelectedType}
          />
        </div>

        {/* Trending Content */}
        {trendingItems.length > 0 ? (
          <div className="space-y-8">
            {/* Top 3 Trending */}
            <section>
              <div className="flex items-center space-x-2 mb-6">
                <Trophy className="w-6 h-6 text-[var(--accent-orange)]" />
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">Top Trending</h2>
                <div className="bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] px-2 py-1 rounded-full text-sm font-medium">
                  Hall of Fame
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {trendingItems.slice(0, 3).map((item, index) => (
                  <div key={item.id} className="relative">
                    {/* Ranking Badge */}
                    <div className={`absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                      index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-500' :
                      'bg-gradient-to-r from-orange-400 to-orange-600'
                    }`}>
                      #{index + 1}
                    </div>
                    
                    {/* Crown for #1 */}
                    {index === 0 && (
                      <div className="absolute -top-4 left-6 z-10">
                        <Crown className="w-6 h-6 text-yellow-400 animate-bounce" />
                      </div>
                    )}
                    
                    <MediaCard
                      item={item}
                      variant="gaming"
                      showUploader={true}
                      showEngagement={true}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Rest of Trending */}
            {trendingItems.length > 3 && (
              <section>
                <div className="flex items-center space-x-2 mb-6">
                  <TrendingUp className="w-6 h-6 text-[var(--accent-blue)]" />
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">More Trending</h2>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {trendingItems.slice(3).map((item, index) => (
                    <div key={item.id} className="relative">
                      {/* Ranking Badge */}
                      <div className="absolute -top-2 -left-2 z-10 w-6 h-6 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-full flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">
                        #{index + 4}
                      </div>
                      
                      <MediaCard
                        item={item}
                        variant="gaming"
                        showUploader={true}
                        showEngagement={true}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="card-gaming p-8 max-w-md mx-auto">
              <div className="text-6xl mb-4">📈</div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                No Trending Content Yet
              </h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Be the first to upload {selectedType === 'all' ? 'content' : selectedType} and start trending!
              </p>
              <div className="text-sm text-[var(--text-muted)]">
                Content becomes trending based on likes, comments, and views
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 