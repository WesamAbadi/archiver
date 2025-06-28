import React, { useState } from 'react';
import { User, MessageCircle, Send, Heart, MoreHorizontal, Flag, Smile } from 'lucide-react';
import { Card } from './Card';
import { formatDistanceToNow, isValid, parseISO } from 'date-fns';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id?: string;
    displayName: string;
    photoURL?: string;
  };
}

interface EnhancedCommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string) => Promise<void>;
  user?: {
    displayName: string;
    photoURL?: string;
  } | null;
  className?: string;
  isLoading?: boolean;
}

export function EnhancedCommentSection({ 
  comments, 
  onAddComment, 
  user, 
  className = '',
  isLoading = false
}: EnhancedCommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const displayedComments = showAll ? comments : comments.slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddComment(newComment);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserAvatar = (user: any, size: string = "w-10 h-10") => {
    const safeUser = user || { displayName: 'Anonymous', photoURL: null };
    const displayName = safeUser.displayName || 'Anonymous';
    const photoURL = safeUser.photoURL;

    // Helper function to create initials avatar
    const createInitialsAvatar = () => (
      <div 
        className={`${size} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg border-2 border-white/20 transition-all duration-300`}
        title={displayName}
      >
        {getInitials(displayName)}
      </div>
    );

    // If no photo URL, return initials avatar
    if (!photoURL) {
      return createInitialsAvatar();
    }

    // Validate URL format
    let isValidUrl = false;
    try {
      new URL(photoURL);
      isValidUrl = true;
    } catch {
      return createInitialsAvatar();
    }

    return (
      <div className={`${size} relative rounded-full shadow-lg transition-all duration-300`}>
        <img
          src={photoURL}
          alt={displayName}
          className={`${size} rounded-full object-cover border-2 border-white/20`}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            const parent = target.parentElement;
            if (parent) {
              // Replace the entire div content with initials avatar
              parent.innerHTML = `
                <div class="${size} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg border-2 border-white/20">
                  ${getInitials(displayName)}
                </div>
              `;
            }
          }}
          loading="lazy"
          title={displayName}
        />
        {/* Add subtle loading state */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-full animate-pulse" />
      </div>
    );
  };

  const formatCommentDate = (dateString: string) => {
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      if (!isValid(date)) {
        return 'Just now';
      }
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Just now';
    }
  };

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-xl border border-blue-500/30">
            <MessageCircle className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              Discussion
            </h2>
            <p className="text-gray-400">
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </p>
          </div>
        </div>
        
        {comments.length > 0 && (
          <div className="flex items-center space-x-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <div className="flex -space-x-2">
              {comments.slice(0, 3).map((comment, i) => (
                <div key={i} className="w-6 h-6 rounded-full border border-white/20">
                  {getUserAvatar(comment.user, "w-6 h-6")}
                </div>
              ))}
            </div>
            {comments.length > 3 && (
              <span className="text-xs text-gray-400">+{comments.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Add Comment Form */}
      {user ? (
        <Card variant="gaming" className="p-6 bg-white/5 backdrop-blur-md border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                {getUserAvatar(user, "w-12 h-12")}
              </div>
              <div className="flex-1 space-y-4">
                <div className="relative">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Share your thoughts..."
                    className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none transition-all backdrop-blur-sm"
                    rows={3}
                    disabled={isSubmitting}
                  />
                  <div className="absolute bottom-3 right-3">
                    <Smile className="w-5 h-5 text-gray-400 hover:text-blue-400 transition-colors cursor-pointer" />
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <p className={`text-xs transition-colors ${
                      newComment.length > 500 ? 'text-red-400' : 
                      newComment.length > 400 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      {newComment.length}/500 characters
                    </p>
                    {newComment.length > 400 && (
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${
                          newComment.length > 500 ? 'bg-red-400' : 'bg-yellow-400'
                        }`}></div>
                        <span className="text-xs text-gray-400">
                          {newComment.length > 500 ? 'Too long' : 'Almost there'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    type="submit"
                    disabled={!newComment.trim() || isSubmitting || newComment.length > 500}
                    className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmitting ? 'Posting...' : 'Post'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </Card>
      ) : (
        <Card variant="gaming" className="p-8 text-center bg-gradient-to-r from-blue-500/10 to-purple-600/10 border border-blue-500/20 backdrop-blur-md">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-2xl">
              <MessageCircle className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Join the conversation
          </h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Sign in to leave a comment and engage with the community. Share your thoughts and connect with other viewers.
          </p>
          <button className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
            Sign In to Comment
          </button>
        </Card>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="gaming" className="p-6 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="flex space-x-4 animate-pulse">
                <div className="w-12 h-12 bg-white/10 rounded-full"></div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-4 bg-white/10 rounded w-24"></div>
                    <div className="h-3 bg-white/5 rounded w-16"></div>
                  </div>
                  <div className="h-4 bg-white/10 rounded w-3/4"></div>
                  <div className="h-4 bg-white/10 rounded w-1/2"></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-4">
          {displayedComments.map((comment, index) => {
            const safeComment = {
              ...comment,
              user: comment.user || { displayName: 'Anonymous', photoURL: null }
            };
            
            return (
              <Card key={comment.id} variant="gaming" className="p-6 bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all duration-300 group">
                <div className="flex space-x-4">
                  <div className="flex-shrink-0">
                    {getUserAvatar(safeComment.user, "w-12 h-12")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <span className="font-bold text-white text-lg">
                          {safeComment.user.displayName || 'Anonymous'}
                        </span>
                        <div className="flex items-center space-x-2">
                          <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                          <span className="text-sm text-gray-400">
                            {formatCommentDate(comment.createdAt)}
                          </span>
                        </div>
                        {index === 0 && (
                          <span className="px-2 py-1 bg-gradient-to-r from-blue-500/20 to-purple-600/20 text-blue-400 text-xs rounded-full border border-blue-500/30">
                            Latest
                          </span>
                        )}
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all">
                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    
                    <p className="text-gray-300 whitespace-pre-wrap break-words leading-relaxed text-lg mb-4">
                      {comment.content}
                    </p>
                    
                    <div className="flex items-center space-x-6">
                      <button className="flex items-center space-x-2 text-gray-400 hover:text-red-400 transition-colors group/btn">
                        <Heart className="w-4 h-4 group-hover/btn:fill-current transition-all" />
                        <span className="text-sm font-medium">Like</span>
                      </button>
                      <button className="flex items-center space-x-2 text-gray-400 hover:text-blue-400 transition-colors">
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Reply</span>
                      </button>
                      <button className="flex items-center space-x-2 text-gray-400 hover:text-orange-400 transition-colors">
                        <Flag className="w-4 h-4" />
                        <span className="text-sm font-medium">Report</span>
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {/* Show More/Less Button */}
          {comments.length > 5 && (
            <div className="text-center pt-4">
              <button
                onClick={() => setShowAll(!showAll)}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all border border-white/20 hover:border-white/30 backdrop-blur-md"
              >
                {showAll 
                  ? `Show less comments` 
                  : `Show ${comments.length - 5} more comments`
                }
              </button>
            </div>
          )}
        </div>
      ) : (
        <Card variant="gaming" className="p-12 text-center bg-white/5 backdrop-blur-md border border-white/10">
          <div className="flex justify-center mb-6">
            <div className="p-6 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-3xl border border-blue-500/20">
              <MessageCircle className="w-12 h-12 text-gray-400" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-white mb-3">
            No comments yet
          </h3>
          <p className="text-gray-400 text-lg max-w-md mx-auto">
            Be the first to share your thoughts about this content. Start the conversation!
          </p>
        </Card>
      )}
    </div>
  );
} 