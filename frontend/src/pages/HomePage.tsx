import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { FiPlay, FiImage, FiMusic, FiFile } from 'react-icons/fi';

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

export default function HomePage() {
  const { user } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchMediaItems();
  }, [activeFilter]);

  const fetchMediaItems = async () => {
    try {
      const response = await axios.get('/api/media/public', {
        params: { filter: activeFilter }
      });
      setMediaItems(response.data.data);
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filter Pills */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {['all', 'video', 'audio', 'image'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-800 rounded-xl mb-3"></div>
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-800 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {mediaItems.map((item) => (
              <Link
                key={item.id}
                to={`/watch/${item.id}`}
                className="group"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden mb-3">
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
                <div className="flex gap-3">
                  {item.user.photoURL ? (
                    <img
                      src={item.user.photoURL}
                      alt={item.user.displayName}
                      className="w-9 h-9 rounded-full"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-300">
                        {item.user.displayName[0]}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-white font-medium line-clamp-2 group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {item.user.displayName}
                    </p>
                    <p className="text-sm text-gray-400">
                      {formatViewCount(item.viewCount)} • {formatDistanceToNow(new Date(item.createdAt))} ago
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* No Results */}
        {!loading && mediaItems.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 text-gray-600">
              <FiFile className="w-full h-full" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">No media found</h3>
            <p className="text-gray-400">
              Try changing your filter or upload some media
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 