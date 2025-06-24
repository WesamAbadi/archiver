import React, { useState } from 'react'
import { useQuery } from 'react-query'
import { Search, Grid, List, Trash2, Edit3, Eye, Download, Filter, Archive as ArchiveIcon } from 'lucide-react'
import { archiveAPI, MediaItem } from '../lib/api'
import { MediaCard } from '../components/MediaCard'

export function ArchivePage() {
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortOrder, setSortOrder] = useState('desc')

  const {
    data: archiveData,
    isLoading,
    error
  } = useQuery(
    ['archive', sortBy, sortOrder],
    () => archiveAPI.getArchive({
      page: 1,
      limit: 50,
      sortBy,
      sortOrder,
    }),
    {
      keepPreviousData: true,
    }
  )

  const allItems = archiveData?.data.data || []

  // Filter items based on search and platform
  const filteredItems = allItems.filter((item: MediaItem) => {
    const matchesSearch = !search || 
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase())
    
    const matchesPlatform = !platform || item.platform === platform
    
    return matchesSearch && matchesPlatform
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <ArchiveIcon className="w-12 h-12 animate-pulse text-[var(--accent-blue)] mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-[var(--accent-purple)]/20 rounded-full animate-ping mx-auto"></div>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Loading Your Archive</h2>
          <p className="text-[var(--text-secondary)]">Gathering your saved content...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📂</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Unable to Load Archive</h1>
          <p className="text-[var(--text-secondary)]">Something went wrong. Please try again later.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-blue)]/10 via-[var(--accent-purple)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <ArchiveIcon className="w-8 h-8 text-[var(--accent-blue)]" />
                <h1 className="text-4xl md:text-5xl font-bold text-gradient">
                  My Archive
                </h1>
              </div>
              <p className="text-xl text-[var(--text-secondary)]">
                Browse and manage your saved content
              </p>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-[var(--accent-blue)]">{allItems.length}</div>
              <div className="text-sm text-[var(--text-secondary)]">Total Items</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Filters */}
        <div className="card-gaming p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search your archive..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[var(--text-secondary)]" />
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                >
                  <option value="">All Platforms</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">Twitter</option>
                  <option value="soundcloud">SoundCloud</option>
                  <option value="direct">Direct Upload</option>
                </select>
              </div>

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split('-')
                  setSortBy(newSortBy)
                  setSortOrder(newSortOrder)
                }}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
              >
                <option value="createdAt-desc">Newest First</option>
                <option value="createdAt-asc">Oldest First</option>
                <option value="title-asc">Title A-Z</option>
                <option value="title-desc">Title Z-A</option>
              </select>

              <div className="flex border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 transition-all ${
                    viewMode === 'grid' 
                      ? 'bg-[var(--accent-blue)] text-white' 
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-all ${
                    viewMode === 'list' 
                      ? 'bg-[var(--accent-blue)] text-white' 
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Archive Items */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="card-gaming p-8 max-w-md mx-auto">
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                {search || platform ? 'No items found' : 'Your archive is empty'}
              </h3>
              <p className="text-[var(--text-secondary)] mb-4">
                {search || platform ? 'Try adjusting your filters' : 'Start by uploading some content to your archive'}
              </p>
              {!search && !platform && (
                <div className="text-sm text-[var(--text-muted)]">
                  Upload from YouTube, SoundCloud, Twitter, or direct files
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
              : 'grid-cols-1'
          }`}>
            {filteredItems.map((item: MediaItem) => (
              <div key={item.id} className="relative group">
                {viewMode === 'grid' ? (
                  <div className="card-gaming overflow-hidden hover-lift">
                    {/* Action Buttons Overlay */}
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="flex space-x-2">
                        <button className="p-2 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg text-[var(--accent-blue)] hover:text-[var(--accent-purple)] transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className="p-2 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg text-[var(--accent-green)] hover:text-[var(--accent-blue)] transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg text-[var(--accent-red)] hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <MediaCard
                      item={{
                        ...item,
                        uploader: {
                          id: item.userId,
                          displayName: 'You',
                          photoURL: ''
                        },
                        engagement: {
                          likes: 0,
                          comments: 0,
                          isLiked: false
                        }
                      }}
                      variant="gaming"
                      showUploader={false}
                      showEngagement={false}
                    />

                    {/* Visibility Badge */}
                    <div className="absolute bottom-2 left-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        item.visibility === 'public' 
                          ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30' 
                          : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)] border border-[var(--text-muted)]/30'
                      }`}>
                        {item.visibility}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="card-gaming p-4 hover-lift">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center flex-shrink-0 border border-[var(--border-primary)]">
                        <span className="text-2xl">
                          {item.platform === 'youtube' && '📺'}
                          {item.platform === 'twitter' && '🐦'}
                          {item.platform === 'soundcloud' && '🎧'}
                          {item.platform === 'direct' && '📄'}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] truncate mb-1">
                          {item.title}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-2">
                          {item.platform} • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                        {item.description && (
                          <p className="text-sm text-[var(--text-muted)] line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end space-y-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          item.visibility === 'public' 
                            ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]' 
                            : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]'
                        }`}>
                          {item.visibility}
                        </span>
                        
                        <div className="flex space-x-2">
                          <button className="p-1.5 text-[var(--accent-blue)] hover:text-[var(--accent-purple)] transition-colors">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 text-[var(--accent-green)] hover:text-[var(--accent-blue)] transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 text-[var(--accent-red)] hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 