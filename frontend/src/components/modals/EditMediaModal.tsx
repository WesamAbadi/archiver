import React, { useState, useEffect } from 'react';
import { Globe, Lock, Users, Calendar, Eye, MessageCircle, Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './Modal';

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
}

interface EditMediaModalProps {
  media: MediaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<MediaItem>) => Promise<void>;
}

export default function EditMediaModal({ media, isOpen, onClose, onSave }: EditMediaModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (media) {
      setTitle(media.title);
      setDescription(media.description || '');
      setVisibility(media.visibility);
    }
  }, [media]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!media) return;
    
    setIsSaving(true);
    try {
      await onSave(media.id, { title, description, visibility });
      onClose();
      toast.success('Media updated successfully');
    } catch (error) {
      toast.error('Failed to update media');
    } finally {
      setIsSaving(false);
    }
  };

  if (!media) return null;

  const footer = (
    <div className="flex justify-end space-x-3">
      <button
        type="button"
        onClick={onClose}
        className="px-6 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        type="submit"
        form="edit-media-form"
        className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 transition-all"
        disabled={isSaving}
      >
        {isSaving ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving...
          </span>
        ) : (
          'Save Changes'
        )}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Media"
      maxWidth="2xl"
      footer={footer}
    >
      <form id="edit-media-form" onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Preview Section */}
        <div className="flex items-center space-x-4">
          <div className="w-32 h-20 bg-gray-800 rounded-xl overflow-hidden flex-shrink-0">
            {media.thumbnailUrl ? (
              <img
                src={media.thumbnailUrl}
                alt={media.title}
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
          <div className="flex-1">
            <div className="flex items-center space-x-3 text-sm text-gray-400">
              <span className="flex items-center">
                <Eye className="w-4 h-4 mr-1" />
                {media.viewCount} views
              </span>
              <span className="flex items-center">
                <Heart className="w-4 h-4 mr-1" />
                {media.likeCount}
              </span>
              <span className="flex items-center">
                <MessageCircle className="w-4 h-4 mr-1" />
                {media.commentCount}
              </span>
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {new Date(media.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
              placeholder="Add a description..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Visibility
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('PUBLIC')}
                className={`flex items-center justify-center px-4 py-3 rounded-xl border ${
                  visibility === 'PUBLIC'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                } transition-all`}
              >
                <Globe className="w-4 h-4 mr-2" />
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility('UNLISTED')}
                className={`flex items-center justify-center px-4 py-3 rounded-xl border ${
                  visibility === 'UNLISTED'
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                } transition-all`}
              >
                <Users className="w-4 h-4 mr-2" />
                Unlisted
              </button>
              <button
                type="button"
                onClick={() => setVisibility('PRIVATE')}
                className={`flex items-center justify-center px-4 py-3 rounded-xl border ${
                  visibility === 'PRIVATE'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                } transition-all`}
              >
                <Lock className="w-4 h-4 mr-2" />
                Private
              </button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
} 