import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Modal from './Modal';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    displayName: string;
    photoURL?: string;
  };
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comments: Comment[];
  newComment: string;
  setNewComment: (comment: string) => void;
  onAddComment: () => void;
  user: any;
}

export default function CommentsModal({
  isOpen,
  onClose,
  comments,
  newComment,
  setNewComment,
  onAddComment,
  user,
}: CommentsModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddComment();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <MessageCircle className="w-6 h-6 mr-3 text-purple-400" />
          Comments ({comments.length})
        </div>
      }
      maxWidth="2xl"
    >
      <div className="flex flex-col max-h-[70vh]">
        {/* Add Comment Form */}
        {user ? (
          <div className="p-6 border-b border-gray-700">
            <form onSubmit={handleSubmit} className="flex space-x-4">
              <img
                src={user.photoURL || '/default-avatar.png'}
                alt={user.displayName || 'You'}
                className="w-12 h-12 rounded-full border-2 border-purple-600/50 flex-shrink-0"
              />
              <div className="flex-1">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                  rows={3}
                />
                <div className="flex justify-end mt-3">
                  <button
                    type="submit"
                    disabled={!newComment.trim()}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Comment
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="p-6 border-b border-gray-700 text-center">
            <p className="text-gray-300 mb-4">Sign in to leave a comment</p>
            <Link
              to="/login"
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors inline-block"
            >
              Sign In
            </Link>
          </div>
        )}

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {comments.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-300 text-lg">No comments yet</p>
              <p className="text-gray-500 text-sm">Be the first to share your thoughts!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="flex space-x-4 p-4 bg-gray-800 rounded-xl border border-gray-700"
              >
                <img
                  src={comment.user.photoURL || '/default-avatar.png'}
                  alt={comment.user.displayName}
                  className="w-10 h-10 rounded-full border border-gray-600 flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold text-white">
                      {comment.user.displayName}
                    </span>
                    <span className="text-sm text-gray-500">
                      {(() => {
                        try {
                          const date = new Date(comment.createdAt);
                          if (isNaN(date.getTime())) {
                            return 'Recently';
                          }
                          return formatDistanceToNow(date, { addSuffix: true });
                        } catch (error) {
                          return 'Recently';
                        }
                      })()}
                    </span>
                  </div>
                  <p className="text-gray-300 leading-relaxed">{comment.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
} 