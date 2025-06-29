import React, { useState, useEffect, useRef } from 'react';
import { Globe, Lock, Users, Calendar, Eye, MessageCircle, Heart, Hash, X, Plus } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { publicAPI } from '../../lib/api';

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
  tags: string[];
}

interface Tag {
  tag: string;
  count: number;
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (media) {
      setTitle(media.title);
      setDescription(media.description || '');
      setVisibility(media.visibility);
      setTags(media.tags || []);
    }
  }, [media]);

  // Fetch tag suggestions when input changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (tagInput.trim().length > 0) {
        try {
          const response = await publicAPI.getPopularTags();
          if (response.data.success && response.data.data && Array.isArray(response.data.data)) {
            // Filter tags that match input and aren't already selected
            const filteredTags = response.data.data.filter((tag: Tag) => 
              tag.tag.toLowerCase().includes(tagInput.toLowerCase()) &&
              !tags.includes(tag.tag)
            );
            setSuggestedTags(filteredTags);
            setShowSuggestions(true);
          } else {
            setSuggestedTags([]);
            setShowSuggestions(false);
          }
        } catch (error) {
          console.error('Error fetching tag suggestions:', error);
          setSuggestedTags([]);
          setShowSuggestions(false);
        }
      } else {
        setSuggestedTags([]);
        setShowSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [tagInput, tags]);

  const handleAddTag = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && !tags.includes(normalizedTag)) {
      setTags([...tags, normalizedTag]);
    }
    setTagInput('');
    setShowSuggestions(false);
    tagInputRef.current?.focus();
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput) {
      e.preventDefault();
      const lastTag = tags[tags.length - 1];
      if (lastTag) {
        handleRemoveTag(lastTag);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!media) return;
    
    setIsSaving(true);
    try {
      await onSave(media.id, { title, description, visibility, tags });
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

          {/* Tags Section */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tags
            </label>
            <div className="min-h-[44px] p-2 bg-gray-800 border border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-all">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-600/30 text-purple-300 border border-purple-600/30"
                  >
                    <Hash className="w-3 h-3 mr-1" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-2 text-purple-300 hover:text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={tags.length === 0 ? "Add tags..." : ""}
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white placeholder-gray-400"
                />
              </div>
            </div>

            {/* Tag Suggestions */}
            {showSuggestions && suggestedTags.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag.tag}
                    type="button"
                    onClick={() => handleAddTag(tag.tag)}
                    className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Hash className="w-4 h-4" />
                    <span>{tag.tag}</span>
                    <span className="text-gray-500 text-sm">({tag.count})</span>
                  </button>
                ))}
              </div>
            )}
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