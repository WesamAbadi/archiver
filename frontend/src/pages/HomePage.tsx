import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { FiPlay, FiImage, FiMusic, FiFile, FiHash } from 'react-icons/fi';
import { publicAPI } from '../lib/api';

interface MediaItem {
  id: string;
  title: string;
  thumbnailUrl?: string;
  duration?: number;
  viewCount: number;
  createdAt: string;
  user: {
    displayName: string;
    photoURL?: string;
  };
}

interface Tag {
  tag: string;
  count: number;
}

export default function HomePage() {
  const { user } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeSort, setActiveSort] = useState('recent');
  const [popularTags, setPopularTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);

  // Fetch random popular tags
  const fetchPopularTags = useCallback(async () => {
    try {
      setLoadingTags(true);
      const response = await publicAPI.getPopularTags({ random: 3 });
      if (response.data.success) {
        setPopularTags(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching popular tags:', error);
      setPopularTags([]); // Set empty array on error
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const fetchMediaItems = useCallback(async () => {
    try {
      setLoading(true);
      let response;
      
      const baseParams = {
        limit: 20,
        ...(activeTag && { tag: activeTag })
      };
      
      switch (activeSort) {
        case 'popular':
          response = await publicAPI.getPublicMedia({
            ...baseParams,
            sortBy: 'viewCount',
            sortOrder: 'desc'
          });
          break;
        case 'recommended':
          response = await publicAPI.getPublicMedia({
            ...baseParams,
            limit: 40 // Fetch more items to shuffle
          });
          // Shuffle the items if we have data
          if (response?.data?.data && Array.isArray(response.data.data)) {
            response.data.data = response.data.data
              .sort(() => Math.random() - 0.5)
              .slice(0, 20); // Take only 20 items
          }
          break;
        case 'recent':
        default:
          response = await publicAPI.getPublicMedia({
            ...baseParams,
            sortBy: 'createdAt',
            sortOrder: 'desc'
          });
          break;
      }
      
      // Extract items from the response (direct array for /media/public)
      const items = response?.data?.data;
      if (Array.isArray(items)) {
        setMediaItems(items);
      } else {
        console.warn('API returned non-array items data:', response?.data?.data);
        setMediaItems([]);
      }
    } catch (error) {
      console.error('Error fetching media:', error);
      setMediaItems([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [activeTag, activeSort]);

  useEffect(() => {
    fetchPopularTags();
  }, [fetchPopularTags]);

  useEffect(() => {
    fetchMediaItems();
  }, [fetchMediaItems]);

  // Listen for upload completion events
  useEffect(() => {
    const handleUploadCompleted = () => {
      fetchMediaItems();
      fetchPopularTags(); // Refresh tags when new content is uploaded
    };

    window.addEventListener('upload-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('upload-completed', handleUploadCompleted);
    };
  }, [fetchMediaItems, fetchPopularTags]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
    return `${count} views`;
  };

  // Get media type icon
  const getMediaIcon = (mimeType: string) => {
    if (mimeType.startsWith('video/')) return <FiPlay className="w-8 h-8" />;
    if (mimeType.startsWith('image/')) return <FiImage className="w-8 h-8" />;
    if (mimeType.startsWith('audio/')) return <FiMusic className="w-8 h-8" />;
    return <FiFile className="w-8 h-8" />;
  };

  return (
    <div className="min-h-screen bg-gray-900 pt-16 md:pt-20 pb-20 md:pb-8">
      <div className="max-w-[2400px] mx-auto px-3 sm:px-4 lg:px-6">
        {/* Filter Pills */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Tag Filters */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !activeTag
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              All Content
            </button>
            {!loadingTags && popularTags.map((tagData) => (
              <button
                key={tagData.tag}
                onClick={() => setActiveTag(tagData.tag)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                  activeTag === tagData.tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <FiHash className="w-3 h-3" />
                <span>{tagData.tag}</span>
                <span className="text-xs opacity-60">({tagData.count})</span>
              </button>
            ))}
            {loadingTags && (
              <div className="flex gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-9 w-24 bg-gray-800 rounded-full animate-pulse"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sort Options */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: 'recent', label: 'Recent' },
              { id: 'popular', label: 'Popular' },
              { id: 'recommended', label: 'Recommended' }
            ].map((sort) => (
              <button
                key={sort.id}
                onClick={() => setActiveSort(sort.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSort === sort.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                {sort.label}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-800 rounded-lg mb-2"></div>
                <div className="h-3 bg-gray-800 rounded w-3/4 mb-1.5"></div>
                <div className="h-2 bg-gray-800 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {Array.isArray(mediaItems) && mediaItems.map((item) => (
              <Link
                key={item.id}
                to={`/watch/${item.id}`}
                className="group"
              >
                {/* Thumbnail */}
                <div className="relative bg-gray-800 rounded-lg overflow-hidden mb-2">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      {getMediaIcon('video/mp4')}
                    </div>
                  )}
                  {item.duration && (
                    <span className="absolute bottom-2 right-2 px-2 py-1 bg-black bg-opacity-80 text-white text-xs rounded">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex gap-2">
                  {item.user.photoURL ? (
                    <img
                      src={item.user.photoURL}
                      alt={item.user.displayName}
                      className="w-7 h-7 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-300">
                        {item.user.displayName?.[0] || '?'}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm text-white font-medium line-clamp-2 group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.user.displayName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatViewCount(item.viewCount)} • {formatDistanceToNow(new Date(item.createdAt))} ago
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* No Results */}
        {!loading && Array.isArray(mediaItems) && mediaItems.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 text-gray-600">
              <FiFile className="w-full h-full" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">No media found</h3>
            <p className="text-gray-400">
              {activeTag ? `No content found with tag #${activeTag}` : 'Try a different filter or upload some media'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 