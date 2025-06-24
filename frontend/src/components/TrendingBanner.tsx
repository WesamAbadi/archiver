import React from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Heart, MessageCircle, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface TrendingBannerProps {
  items: Array<{
    id: string
    title: string
    platform: string
    uploader: {
      displayName: string
      photoURL?: string
    }
    engagement: {
      likes: number
      comments: number
      views?: number
      score: number
    }
    createdAt: string
    metadata?: {
      duration?: number
    }
  }>
}

export function TrendingBanner({ items }: TrendingBannerProps) {
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

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'youtube':
        return 'bg-red-500'
      case 'soundcloud':
        return 'bg-orange-500'
      case 'twitter':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mb-8">
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-6 text-white">
        <div className="flex items-center mb-4">
          <TrendingUp className="w-6 h-6 mr-2" />
          <h2 className="text-2xl font-bold">Trending Now</h2>
          <span className="ml-2 bg-white bg-opacity-20 px-2 py-1 rounded-full text-sm">
            🔥 Hot
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <div className="flex space-x-4 pb-2" style={{ width: `${items.length * 280}px` }}>
            {items.slice(0, 10).map((item, index) => (
              <Link
                key={item.id}
                to={`/watch/${item.id}`}
                className="flex-shrink-0 w-64 bg-white bg-opacity-10 rounded-lg p-4 hover:bg-opacity-20 transition-all duration-200 group"
              >
                {/* Trending Rank */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-xs font-bold">
                      #{index + 1}
                    </div>
                    <div className={`${getPlatformColor(item.platform)} px-2 py-1 rounded-full text-xs font-medium capitalize`}>
                      {item.platform}
                    </div>
                  </div>
                  
                  {item.metadata?.duration && (
                    <div className="bg-black bg-opacity-30 px-2 py-1 rounded text-xs">
                      {formatDuration(item.metadata.duration)}
                    </div>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-semibold mb-2 line-clamp-2 text-sm group-hover:text-orange-200 transition-colors">
                  {item.title}
                </h3>

                {/* Uploader */}
                <div className="flex items-center space-x-2 mb-3">
                  <img
                    src={item.uploader.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=24&h=24&fit=crop&crop=face`}
                    alt={item.uploader.displayName}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-xs text-white text-opacity-80 truncate">
                    {item.uploader.displayName}
                  </span>
                </div>

                {/* Engagement Stats */}
                <div className="flex items-center justify-between text-xs text-white text-opacity-70">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <Heart className="w-3 h-3" />
                      <span>{item.engagement.likes}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MessageCircle className="w-3 h-3" />
                      <span>{item.engagement.comments}</span>
                    </div>
                    {item.engagement.views && (
                      <div className="flex items-center space-x-1">
                        <Eye className="w-3 h-3" />
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

                {/* Trending Score */}
                <div className="mt-2 text-xs">
                  <div className="bg-white bg-opacity-20 rounded-full px-2 py-1 inline-block">
                    🔥 Score: {item.engagement.score}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* View All Trending Link */}
        <div className="mt-4 text-center">
          <Link
            to="/trending"
            className="inline-flex items-center px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg font-medium transition-all duration-200"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            View All Trending
          </Link>
        </div>
      </div>
    </div>
  )
} 