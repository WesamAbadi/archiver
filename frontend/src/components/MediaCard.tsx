import React from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Eye, Play, Music, Image as ImageIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface MediaCardProps {
  item: {
    id: string
    title: string
    description?: string
    platform: string
    files: Array<{
      mimeType: string
      downloadUrl: string
      size: number
    }>
    uploader: {
      id: string
      displayName: string
      photoURL?: string
    }
    engagement: {
      likes: number
      comments: number
      views?: number
      isLiked: boolean
    }
    createdAt: string
    metadata?: {
      duration?: number
      originalAuthor?: string
    }
  }
  showUploader?: boolean
  showEngagement?: boolean
  variant?: 'default' | 'gaming'
}

export function MediaCard({ item, showUploader = true, showEngagement = true, variant = 'default' }: MediaCardProps) {
  const getMediaTypeIcon = () => {
    const mimeType = item.files[0]?.mimeType || ''
    
    if (mimeType.startsWith('video/')) {
      return <Play className="w-8 h-8" />
    } else if (mimeType.startsWith('audio/')) {
      return <Music className="w-8 h-8" />
    } else if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-8 h-8" />
    }
    
    return <Play className="w-8 h-8" />
  }

  const getPlatformBadge = () => {
    const platformConfig = {
      youtube: { label: 'YouTube', class: 'badge-youtube' },
      soundcloud: { label: 'SoundCloud', class: 'badge-soundcloud' },
      twitter: { label: 'Twitter', class: 'badge-twitter' },
      direct: { label: 'Direct', class: 'badge-primary' }
    }
    
    const config = platformConfig[item.platform as keyof typeof platformConfig] || 
                  { label: item.platform, class: 'badge-secondary' }
    
    return (
      <span className={`badge ${config.class} text-xs`}>
        {config.label}
      </span>
    )
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`
    }
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const cardClass = variant === 'gaming' ? 'card-gaming hover-lift' : 'card hover-lift'

  return (
    <Link to={`/watch/${item.id}`} className="group block">
      <div className={cardClass}>
        {/* Thumbnail/Preview */}
        <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
          {/* Media Type Icon */}
          <div className="text-white/60 group-hover:text-white/80 transition-colors">
            {getMediaTypeIcon()}
          </div>

          {/* Platform Badge */}
          <div className="absolute top-3 left-3">
            {getPlatformBadge()}
          </div>

          {/* Duration Badge */}
          {item.metadata?.duration && (
            <div className="absolute bottom-3 right-3 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
              {formatDuration(item.metadata.duration)}
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
            <Play className="w-12 h-12 text-white drop-shadow-lg" />
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <h3 className={`font-semibold line-clamp-2 group-hover:text-[var(--accent-blue)] transition-colors ${
            variant === 'gaming' ? 'text-white' : 'text-gray-900'
          }`}>
            {item.title}
          </h3>

          {/* Uploader Info */}
          {showUploader && (
            <div className="flex items-center space-x-2">
              <img
                src={item.uploader.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face`}
                alt={item.uploader.displayName}
                className="w-6 h-6 rounded-full"
              />
              <span className={`text-sm truncate ${
                variant === 'gaming' ? 'text-[var(--text-secondary)]' : 'text-gray-600'
              }`}>
                {item.uploader.displayName}
              </span>
            </div>
          )}

          {/* Engagement Stats */}
          {showEngagement && (
            <div className={`flex items-center justify-between text-sm ${
              variant === 'gaming' ? 'text-[var(--text-muted)]' : 'text-gray-500'
            }`}>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <Heart className={`w-4 h-4 ${item.engagement.isLiked ? 'text-red-500 fill-current' : ''}`} />
                  <span>{item.engagement.likes}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MessageCircle className="w-4 h-4" />
                  <span>{item.engagement.comments}</span>
                </div>
                {item.engagement.views && (
                  <div className="flex items-center space-x-1">
                    <Eye className="w-4 h-4" />
                    <span>{item.engagement.views}</span>
                  </div>
                )}
              </div>
              
              <div className="text-xs">
                {(() => {
                  try {
                    const date = new Date(item.createdAt);
                    if (isNaN(date.getTime())) {
                      return 'Recently';
                    }
                    return formatDistanceToNow(date, { addSuffix: true });
                  } catch (error) {
                    return 'Recently';
                  }
                })()}
              </div>
            </div>
          )}

          {/* File Info */}
          <div className={`text-xs ${
            variant === 'gaming' ? 'text-[var(--text-muted)]' : 'text-gray-400'
          }`}>
            {item.files[0] && formatFileSize(item.files[0].size)}
          </div>

          {/* Original Author (if different from uploader) */}
          {item.metadata?.originalAuthor && item.metadata.originalAuthor !== item.uploader.displayName && (
            <div className={`text-xs ${
              variant === 'gaming' ? 'text-[var(--text-muted)]' : 'text-gray-500'
            }`}>
              Originally by {item.metadata.originalAuthor}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
} 