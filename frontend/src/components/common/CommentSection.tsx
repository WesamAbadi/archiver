import React, { useState } from 'react';
import { User, MessageCircle, Send } from 'lucide-react';
import { Card } from './Card';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    displayName: string;
    photoURL?: string;
  };
}

interface CommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string) => Promise<void>;
  user?: {
    displayName: string;
    photoURL?: string;
  } | null;
  className?: string;
}

export function CommentSection({ comments, onAddComment, user, className = '' }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center space-x-2 mb-6">
        <MessageCircle className="w-5 h-5 text-[var(--text-secondary)]" />
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          Comments ({comments.length})
        </h2>
      </div>

      {/* Add Comment */}
      {user ? (
        <form onSubmit={handleSubmit} className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent resize-none"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="btn btn-primary"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSubmitting ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <Card variant="hover" className="p-4 text-center">
          <p className="text-[var(--text-secondary)]">
            Please sign in to leave a comment
          </p>
        </Card>
      )}

      {/* Comments List */}
      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="flex space-x-4">
            <div className="flex-shrink-0">
              {comment.user.photoURL ? (
                <img
                  src={comment.user.photoURL}
                  alt={comment.user.displayName}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-medium text-[var(--text-primary)]">
                  {comment.user.displayName}
                </span>
                <span className="text-sm text-[var(--text-muted)]">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            </div>
          </div>
        ))}

        {comments.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
            <p className="text-[var(--text-secondary)]">No comments yet</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Be the first to share your thoughts
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 