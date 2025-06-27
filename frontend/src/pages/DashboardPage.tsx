import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface MediaItem {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  visibility: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  duration?: number;
  platform: string;
}

export function DashboardPage() {
  const { user, getToken } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('content');

  useEffect(() => {
    fetchMediaItems();
  }, []);

  const fetchMediaItems = async () => {
    try {
      const token = await getToken();
      const response = await axios.get('/api/media', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMediaItems(response.data.data);
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedItems.length === mediaItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(mediaItems.map(item => item.id));
    }
  };

  const handleSelect = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(item => item !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} item(s)?`)) return;
    
    try {
      const token = await getToken();
      await Promise.all(ids.map(id =>
        axios.delete(`/api/media/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ));
      fetchMediaItems();
      setSelectedItems([]);
    } catch (error) {
      console.error('Error deleting items:', error);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="border-b border-gray-200">
            <div className="px-6 py-4">
              <h1 className="text-2xl font-semibold">Channel content</h1>
            </div>
            <div className="flex px-6">
              <button
                onClick={() => setActiveTab('content')}
                className={`px-4 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'content'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-700 hover:text-gray-900'
                }`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-3 text-sm font-medium border-b-2 ml-8 ${
                  activeTab === 'analytics'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-700 hover:text-gray-900'
                }`}
              >
                Analytics
              </button>
            </div>
          </div>

          {activeTab === 'content' && (
                  <div>
              {selectedItems.length > 0 && (
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    {selectedItems.length} selected
                  </span>
                      <button
                    onClick={() => handleDelete(selectedItems)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Delete
                      </button>
                    </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={selectedItems.length === mediaItems.length && mediaItems.length > 0}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Video
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Visibility
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Views
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Comments
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Likes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mediaItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => handleSelect(item.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-32 h-18 bg-gray-200 rounded overflow-hidden mr-4">
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                  </svg>
                      </div>
                    )}
                  </div>
                            <div>
                              <Link
                                to={`/watch/${item.id}`}
                                className="text-sm font-medium text-gray-900 hover:underline"
                              >
                                {item.title}
                              </Link>
                              {item.description && (
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
              </div>
            </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            item.visibility === 'PUBLIC'
                              ? 'bg-green-100 text-green-800'
                              : item.visibility === 'UNLISTED'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {item.visibility.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.viewCount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.commentCount}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.likeCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Total views</h3>
                  <p className="text-3xl font-semibold text-gray-900">
                    {mediaItems.reduce((sum, item) => sum + item.viewCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Total likes</h3>
                  <p className="text-3xl font-semibold text-gray-900">
                    {mediaItems.reduce((sum, item) => sum + item.likeCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Total comments</h3>
                  <p className="text-3xl font-semibold text-gray-900">
                    {mediaItems.reduce((sum, item) => sum + item.commentCount, 0).toLocaleString()}
                  </p>
                </div>
              </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
} 