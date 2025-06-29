import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Globe, Lock, Users, Calendar, Eye, MessageCircle, Heart, X, FileText, MoreVertical, Edit, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
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
  captionStatus?: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  tags: string[];
  files?: Array<{
    id: string;
    downloadUrl: string;
    mimeType: string;
    filename: string;
  }>;
}

export function DashboardPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('content');
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);

  const fetchMediaItems = useCallback(async () => {
    try {
      setLoading(true);
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
  }, [getToken]);

  useEffect(() => {
    fetchMediaItems();
  }, [fetchMediaItems]);

  // Listen for upload completion events
  useEffect(() => {
    const handleUploadCompleted = () => {
      fetchMediaItems();
    };

    window.addEventListener('upload-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('upload-completed', handleUploadCompleted);
    };
  }, [fetchMediaItems]);

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

  const handleEditCaptions = (item: MediaItem) => {
    navigate(`/media/${item.id}/captions`);
  };

  // Get caption status icon and color
  const getCaptionStatusIcon = (status?: string) => {
    switch (status) {
      case 'PENDING':
        return <span title="Pending caption generation"><Clock className="w-4 h-4 text-gray-400" /></span>;
      case 'QUEUED':
        return <span title="Queued for caption generation"><Clock className="w-4 h-4 text-yellow-400" /></span>;
      case 'PROCESSING':
        return <span title="Generating captions..."><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /></span>;
      case 'COMPLETED':
        return <span title="Captions available"><CheckCircle className="w-4 h-4 text-green-400" /></span>;
      case 'FAILED':
        return <span title="Caption generation failed"><XCircle className="w-4 h-4 text-red-400" /></span>;
      case 'SKIPPED':
        return <span title="No captions (not audio/video)"><AlertCircle className="w-4 h-4 text-gray-400" /></span>;
      default:
        return null;
    }
  };

  const getCaptionStatusText = (status?: string) => {
    switch (status) {
      case 'PENDING': return 'Pending';
      case 'QUEUED': return 'Queued';
      case 'PROCESSING': return 'Processing';
      case 'COMPLETED': return 'Ready';
      case 'FAILED': return 'Failed';
      case 'SKIPPED': return 'N/A';
      default: return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-[2200px] mx-auto p-3 sm:p-4 lg:p-6">
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
          <div className="border-b border-gray-700">
            <div className="px-4 sm:px-6 py-3 sm:py-4">
              <h1 className="text-xl sm:text-2xl font-semibold text-white">Channel content</h1>
            </div>
            <div className="flex px-4 sm:px-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab('content')}
                className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'content'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                } transition-colors`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 ml-6 sm:ml-8 whitespace-nowrap ${
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
                <div className="px-4 sm:px-6 py-3 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
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

              {/* Mobile Card View */}
              <div className="block sm:hidden">
                {mediaItems.map((item) => (
                  <div key={item.id} className="border-b border-gray-700 p-4">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelect(item.id)}
                        className="mt-1 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                      />
                      
                      <div className="w-20 h-12 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/watch/${item.id}`}
                              className="text-sm font-medium text-white hover:text-purple-400 transition-colors line-clamp-2"
                            >
                              {item.title}
                            </Link>
                            {item.description && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-1 ml-2">
                            <button
                              onClick={() => setEditingMedia(item)}
                              className="p-2 text-gray-400 hover:text-white transition-colors"
                              title="Edit media"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditCaptions(item)}
                              className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                              title="Edit captions"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center space-x-3 text-xs text-gray-400">
                            <span className="flex items-center">
                              <Eye className="w-3 h-3 mr-1" />
                              {item.viewCount.toLocaleString()}
                            </span>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {/* Caption Status */}
                            <div className="flex items-center space-x-1">
                              {getCaptionStatusIcon(item.captionStatus)}
                              <span className="text-xs text-gray-400">
                                {getCaptionStatusText(item.captionStatus)}
                              </span>
                            </div>
                            
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.visibility === 'PUBLIC'
                                ? 'bg-green-500/20 text-green-400'
                                : item.visibility === 'UNLISTED'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {item.visibility === 'PUBLIC' && <Globe className="w-2 h-2 mr-1" />}
                              {item.visibility === 'UNLISTED' && <Users className="w-2 h-2 mr-1" />}
                              {item.visibility === 'PRIVATE' && <Lock className="w-2 h-2 mr-1" />}
                              {item.visibility.toLowerCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-4 lg:px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={selectedItems.length === mediaItems.length && mediaItems.length > 0}
                          className="rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                        />
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Video
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                        Visibility
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                        Captions
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                        Date
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                        Views
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                        Comments
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                        Likes
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {mediaItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 lg:px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => handleSelect(item.id)}
                            className="rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                          />
                        </td>
                        <td className="px-4 lg:px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-24 h-14 lg:w-32 lg:h-18 bg-gray-700 rounded-xl overflow-hidden mr-3 lg:mr-4 flex-shrink-0">
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
                                  <svg className="w-6 h-6 lg:w-8 lg:h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2">
                                <Link
                                  to={`/watch/${item.id}`}
                                  className="text-sm font-medium text-white hover:text-purple-400 transition-colors truncate"
                                >
                                  {item.title}
                                </Link>
                                <button
                                  onClick={() => setEditingMedia(item)}
                                  className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                                  title="Edit media details"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              </div>
                              {item.description && (
                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                              {/* Mobile-only stats for SM screens */}
                              <div className="flex items-center space-x-3 text-xs text-gray-400 mt-2 md:hidden">
                                <span className="flex items-center">
                                  <Eye className="w-3 h-3 mr-1" />
                                  {item.viewCount.toLocaleString()}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  item.visibility === 'PUBLIC'
                                    ? 'bg-green-500/20 text-green-400'
                                    : item.visibility === 'UNLISTED'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {item.visibility === 'PUBLIC' && <Globe className="w-2 h-2 mr-1" />}
                                  {item.visibility === 'UNLISTED' && <Users className="w-2 h-2 mr-1" />}
                                  {item.visibility === 'PRIVATE' && <Lock className="w-2 h-2 mr-1" />}
                                  {item.visibility.toLowerCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 hidden md:table-cell">
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
                        <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                          <div className="flex items-center space-x-2">
                            {getCaptionStatusIcon(item.captionStatus)}
                            <span className="text-sm text-gray-300">
                              {getCaptionStatusText(item.captionStatus)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-sm text-gray-300 hidden xl:table-cell">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-sm text-gray-300 hidden lg:table-cell">
                          {item.viewCount.toLocaleString()}
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-sm text-gray-300 hidden xl:table-cell">
                          {item.commentCount}
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-sm text-gray-300 hidden xl:table-cell">
                          {item.likeCount}
                        </td>
                        <td className="px-4 lg:px-6 py-4">
                          <button
                            onClick={() => handleEditCaptions(item)}
                            className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                            title="Edit captions"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <div className="bg-gray-700/50 rounded-xl p-4 sm:p-6 border border-gray-600">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total views</h3>
                  <p className="text-2xl sm:text-3xl font-semibold text-white">
                    {mediaItems.reduce((sum, item) => sum + item.viewCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-4 sm:p-6 border border-gray-600">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total likes</h3>
                  <p className="text-2xl sm:text-3xl font-semibold text-white">
                    {mediaItems.reduce((sum, item) => sum + item.likeCount, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-4 sm:p-6 border border-gray-600 sm:col-span-2 xl:col-span-1">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Total comments</h3>
                  <p className="text-2xl sm:text-3xl font-semibold text-white">
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