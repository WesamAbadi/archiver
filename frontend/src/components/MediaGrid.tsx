import React from 'react';
import { Link } from 'react-router-dom';
import { MediaItem } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { FiPlay, FiImage, FiMusic, FiFile } from 'react-icons/fi';

interface MediaGridProps {
  items: MediaItem[];
}

export function MediaGrid({ items }: MediaGridProps) {
  // Helper function to get media type icon
  const getMediaIcon = (item: MediaItem) => {
    const mimeType = item.files[0]?.mimeType || '';
    if (mimeType.startsWith('video/')) return <FiPlay className="w-6 h-6" />;
    if (mimeType.startsWith('image/')) return <FiImage className="w-6 h-6" />;
    if (mimeType.startsWith('audio/')) return <FiMusic className="w-6 h-6" />;
    return <FiFile className="w-6 h-6" />;
  };

  // Helper function to format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Link
          key={item.id}
          to={`/watch/${item.id}`}
          className="group bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-200"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video bg-gray-100 dark:bg-gray-700">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                {getMediaIcon(item)}
              </div>
            )}
            {item.duration && (
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {item.title}
            </h3>
            
            {/* Metadata */}
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-2">
                {item.user?.displayName && (
                  <span>{item.user.displayName}</span>
                )}
                <span>•</span>
                <span>{formatDistanceToNow(new Date(item.createdAt))} ago</span>
              </div>
              <div className="mt-1 flex items-center space-x-2">
                <span>{item.viewCount} views</span>
                {item.likeCount > 0 && (
                  <>
                    <span>•</span>
                    <span>{item.likeCount} likes</span>
                  </>
                )}
              </div>
            </div>

            {/* Tags */}
            {item.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.slice(0, 3).map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {item.tags.length > 3 && (
                  <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                    +{item.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
} 