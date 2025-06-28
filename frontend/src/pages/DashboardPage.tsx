import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Globe, Lock, Users, Calendar, Eye, MessageCircle, Heart, X } from 'lucide-react';
import EditMediaModal from '../components/modals/EditMediaModal';

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
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);

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
      toast.error('Failed to load media items');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMedia = async (id: string, updates: Partial<MediaItem>) => {
    try {
      const token = await getToken();
      await axios.patch(`/api/media/${id}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchMediaItems();
    } catch (error) {
      console.error('Error updating media:', error);
      throw error;
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
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-[2200px] mx-auto p-6">
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
          <div className="border-b border-gray-700">
            <div className="px-6 py-4">
              <h1 className="text-2xl font-semibold text-white">Channel content</h1>
            </div>
            <div className="flex px-6">
              <button
                onClick={() => setActiveTab('content')}
                className={`px-4 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'content'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                } transition-colors`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-3 text-sm font-medium border-b-2 ml-8 ${
                  activeTab === 'analytics'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                } transition-colors`}
              >
                Analytics
              </button>
            </div>
          </div>

          {activeTab === 'content' && (
            <div>
              {selectedItems.length > 0 && (
                <div className="px-6 py-3 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm text-gray-300">
                    {selectedItems.length} selected
                  </span>
                  <button
                    onClick={() => handleDelete(selectedItems)}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={selectedItems.length === mediaItems.length && mediaItems.length > 0}
                          className="rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Video
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Visibility
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Views
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Comments
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Likes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {mediaItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => handleSelect(item.id)}
                            className="rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-32 h-18 bg-gray-700 rounded-xl overflow-hidden mr-4">
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <Link
                                  to={`/watch/${item.id}`}
                                  className="text-sm font-medium text-white hover:text-purple-400 transition-colors"
                                >
                                  {item.title}
                                </Link>
                                <button
                                  onClick={() => setEditingMedia(item)}
                                  className="text-gray-400 hover:text-white transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              </div>
                              {item.description && (
                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            item.visibility === 'PUBLIC'
                              ? 'bg-green-500/20 text-green-400'
                              : item.visibility === 'UNLISTED'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {item.visibility === 'PUBLIC' && <Globe className="w-3 h-3 mr-1" />}
                            {item.visibility === 'UNLISTED' && <Users className="w-3 h-3 mr-1" />}
                            {item.visibility === 'PRIVATE' && <Lock className="w-3 h-3 mr-1" />}
                            {item.visibility.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {item.viewCount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {item.commentCount}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
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
                <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total views</h3>
                  <p className="text-3xl font-semibold text-white">
                    {mediaItems.reduce((sum, item) => sum + item.viewCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total likes</h3>
                  <p className="text-3xl font-semibold text-white">
                    {mediaItems.reduce((sum, item) => sum + item.likeCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total comments</h3>
                  <p className="text-3xl font-semibold text-white">
                    {mediaItems.reduce((sum, item) => sum + item.commentCount, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditMediaModal
        media={editingMedia}
        isOpen={!!editingMedia}
        onClose={() => setEditingMedia(null)}
        onSave={handleUpdateMedia}
      />
    </div>
  );
} 