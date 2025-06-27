import React, { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { publicAPI } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import MediaPlayer from '../components/MediaPlayer'
import ErrorBoundary from '../components/ErrorBoundary'
import { 
  Heart, 
  MessageCircle, 
  Eye, 
  Download, 
  Share2, 
  Calendar,
  User,
  ExternalLink,
  Send,
  Loader2,
  Globe,
  FileText,
  Clock,
  ArrowLeft
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [showFullDescription, setShowFullDescription] = useState(false)

  // Utility function for formatting time
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get media item with comments
  const { data: mediaData, isLoading, error } = useQuery(
    ['public-media', id],
    () => publicAPI.getMediaItem(id!),
    {
      enabled: !!id,
    }
  )

  // Like/unlike mutation
  const likeMutation = useMutation(
    () => publicAPI.toggleLike(id!),
    {
      onSuccess: (response) => {
        // Update the media item in the cache with new engagement data
        queryClient.setQueryData(['public-media', id], (oldData: any) => {
          if (oldData?.data?.data) {
            return {
              ...oldData,
              data: {
                ...oldData.data,
                data: {
                  ...oldData.data.data,
                  engagement: response.data.data.engagement
                }
              }
            }
          }
          return oldData
        })
        
        const action = response.data.data.action
        toast.success(action === 'liked' ? '❤️ Liked!' : '💔 Unliked!')
      },
      onError: () => {
        toast.error('Failed to update like status')
      }
    }
  )

  // Add comment mutation
  const commentMutation = useMutation(
    (content: string) => publicAPI.addComment(id!, content),
    {
      onSuccess: (response) => {
        setComment('')
        
        // Update the media item in the cache with new comment and engagement data
        queryClient.setQueryData(['public-media', id], (oldData: any) => {
          if (oldData?.data?.data) {
            const newComment = response.data.data.comment
            const updatedComments = [newComment, ...oldData.data.data.comments]
            
            return {
              ...oldData,
              data: {
                ...oldData.data,
                data: {
                  ...oldData.data.data,
                  comments: updatedComments,
                  engagement: response.data.data.engagement
                }
              }
            }
          }
          return oldData
        })
        
        toast.success('💬 Comment added!')
      },
      onError: () => {
        toast.error('Failed to add comment')
      }
    }
  )

  const handleLike = () => {
    if (!user) {
      toast.error('Please sign in to like content')
      return
    }
    likeMutation.mutate()
  }

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Please sign in to comment')
      return
    }
    if (comment.trim()) {
      commentMutation.mutate(comment.trim())
    }
  }

  const handleShare = async () => {
    try {
      if (navigator.share && media) {
        await navigator.share({
          title: media.title,
          text: `Check out "${media.title}" on ArchiveDrop`,
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('🔗 Link copied to clipboard!')
      }
    } catch (error) {
      try {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('🔗 Link copied to clipboard!')
      } catch (err) {
        toast.error('Failed to share content')
      }
    }
  }

  const handleDownload = async () => {
    if (media?.files?.[0]?.downloadUrl) {
      window.open(media.files[0].downloadUrl, '_blank')
      toast.success('⬇️ Download started!')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <Eye className="w-12 h-12 animate-pulse text-[var(--accent-blue)] mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-[var(--accent-purple)]/20 rounded-full animate-ping mx-auto"></div>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Loading Content</h2>
          <p className="text-[var(--text-secondary)]">Please wait while we load this amazing content...</p>
        </div>
      </div>
    )
  }

  if (error || !mediaData?.data.success) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😞</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Content Not Found</h1>
          <p className="text-[var(--text-secondary)] mb-6">This content may have been removed or made private.</p>
          <Link to="/" className="btn btn-primary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const media = mediaData.data.data
  const primaryFile = media.files[0]
  const isAudio = primaryFile.mimeType.startsWith('audio/')
  const isVideo = primaryFile.mimeType.startsWith('video/')
  const isImage = primaryFile.mimeType.startsWith('image/')

  const getPlatformIcon = () => {
    switch (media.platform) {
      case 'youtube':
        return '📺'
      case 'soundcloud':
        return '🎧'
      case 'twitter':
        return '🐦'
      default:
        return '📄'
    }
  }

  const getPlatformColor = () => {
    switch (media.platform) {
      case 'youtube':
        return 'platform-youtube'
      case 'soundcloud':
        return 'platform-soundcloud'
      case 'twitter':
        return 'platform-twitter'
      default:
        return 'platform-direct'
    }
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    if (mb >= 1000) {
      return `${(mb / 1024).toFixed(1)} GB`
    } else if (mb >= 1) {
      return `${mb.toFixed(1)} MB`
    }
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Navigation */}
      <div className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            to="/" 
            className="inline-flex items-center text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Media Player */}
            <div className="card-gaming overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-tertiary)] flex items-center justify-center relative">
                {/* Platform Badge */}
                <div className={`absolute top-4 left-4 ${getPlatformColor()} text-white px-3 py-1 rounded-full text-sm font-medium capitalize z-10`}>
                  {getPlatformIcon()} {media.platform}
                </div>

                {/* Duration Badge */}
                {media.metadata?.duration && (
                  <div className="absolute top-4 right-4 bg-black/75 text-white px-3 py-1 rounded-lg text-sm z-10">
                    {formatTime(media.metadata.duration)}
                  </div>
                )}

                {/* Audio Player */}
                {isAudio && (
                  <div className="w-full h-full flex items-center justify-center relative p-8">
                    <div className="w-full max-w-2xl">
                      <ErrorBoundary>
                        <MediaPlayer
                          src={primaryFile.downloadUrl}
                          type="audio"
                          title={media.title}
                          className="w-full"
                        />
                      </ErrorBoundary>
                    </div>
                  </div>
                )}

                {/* Video Player */}
                {isVideo && (
                  <div className="w-full h-full relative">
                    <ErrorBoundary>
                      <MediaPlayer
                        src={primaryFile.downloadUrl}
                        type="video"
                        title={media.title}
                        className="w-full h-full"
                      />
                    </ErrorBoundary>
                  </div>
                )}

                {/* Image Viewer */}
                {isImage && (
                  <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={primaryFile.downloadUrl}
                      alt={media.title}
                      className="max-w-full max-h-full object-contain"
                      onClick={() => window.open(primaryFile.downloadUrl, '_blank')}
                    />
                  </div>
                )}

                {/* Download Button */}
                <button
                  onClick={handleDownload}
                  className="absolute bottom-4 right-4 bg-black/75 hover:bg-black/90 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-all hover-lift"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Title and Engagement */}
            <div className="card-gaming p-6">
              <h1 className="text-3xl font-bold text-gradient mb-6">{media.title}</h1>

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-6">
                  <button
                    onClick={handleLike}
                    disabled={likeMutation.isLoading}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all hover-lift ${
                      media.engagement.isLiked
                        ? 'bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/30'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:border-[var(--accent-blue)]'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${media.engagement.isLiked ? 'fill-current' : ''} ${likeMutation.isLoading ? 'animate-pulse' : ''}`} />
                    <span className="font-medium">{media.engagement.likes}</span>
                  </button>

                  <div className="flex items-center space-x-2 text-[var(--text-secondary)]">
                    <MessageCircle className="w-5 h-5" />
                    <span className="font-medium">{media.engagement.comments}</span>
                  </div>

                  {media.engagement.views && (
                    <div className="flex items-center space-x-2 text-[var(--text-secondary)]">
                      <Eye className="w-5 h-5" />
                      <span className="font-medium">{media.engagement.views} views</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleShare}
                  className="flex items-center space-x-2 px-6 py-3 bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-primary)] rounded-xl hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-all hover-lift"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Share</span>
                </button>
              </div>

              {/* Description */}
              {media.description && (
                <div className="border-t border-[var(--border-primary)] pt-6">
                  <div className={`text-[var(--text-secondary)] leading-relaxed ${showFullDescription ? '' : 'line-clamp-3'}`}>
                    {media.description.split('\n').map((line, index) => (
                      <React.Fragment key={index}>
                        {line}
                        {index < media.description.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                  {media.description.length > 200 && (
                    <button
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="text-[var(--accent-blue)] hover:text-[var(--accent-purple)] text-sm mt-3 transition-colors"
                    >
                      {showFullDescription ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}

              {/* Original URL */}
              {media.originalUrl && (
                <div className="mt-6 pt-6 border-t border-[var(--border-primary)]">
                  <a
                    href={media.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-[var(--accent-blue)] hover:text-[var(--accent-purple)] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View Original Source</span>
                  </a>
                </div>
              )}
            </div>

            {/* Comments Section */}
            <div className="card-gaming p-6">
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6 flex items-center">
                <MessageCircle className="w-6 h-6 mr-3 text-[var(--accent-blue)]" />
                Comments ({media.engagement.comments})
              </h2>

              {/* Add Comment Form */}
              {user ? (
                <form onSubmit={handleComment} className="mb-8">
                  <div className="flex space-x-4">
                    <img
                      src={user.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face`}
                      alt={user.displayName || 'You'}
                      className="w-12 h-12 rounded-full border-2 border-[var(--border-primary)]"
                    />
                    <div className="flex-1">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent resize-none transition-all"
                        rows={3}
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          type="submit"
                          disabled={!comment.trim() || commentMutation.isLoading}
                          className="btn btn-primary"
                        >
                          {commentMutation.isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          Comment
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="mb-8 p-6 bg-[var(--bg-secondary)] rounded-xl text-center border border-[var(--border-primary)]">
                  <p className="text-[var(--text-secondary)] mb-4">Sign in to leave a comment and engage with the community</p>
                  <Link to="/login" className="btn btn-primary">
                    Sign In
                  </Link>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-6">
                {media.comments.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-[var(--text-muted)]" />
                    </div>
                    <p className="text-[var(--text-secondary)] text-lg">No comments yet</p>
                    <p className="text-[var(--text-muted)] text-sm">Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  media.comments.map((comment: any) => (
                    <div key={comment.id} className="flex space-x-4 p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] hover-lift">
                      <img
                        src={comment.user.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face`}
                        alt={comment.user.displayName}
                        className="w-10 h-10 rounded-full border border-[var(--border-primary)]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {comment.user.displayName}
                          </span>
                          <span className="text-sm text-[var(--text-muted)]">
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
                        <p className="text-[var(--text-secondary)] leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Uploader Info */}
            <div className="card-gaming p-6">
              <div className="flex items-center space-x-4 mb-6">
                <img
                  src={media.uploader.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&crop=face`}
                  alt={media.uploader.displayName}
                  className="w-14 h-14 rounded-full border-2 border-[var(--border-primary)]"
                />
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-lg">{media.uploader.displayName}</h3>
                  <p className="text-sm text-[var(--accent-blue)]">Content Creator</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-3 text-[var(--text-secondary)]">
                  <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />
                  <span>Uploaded {(() => {
                    try {
                      const date = new Date(media.createdAt);
                      if (isNaN(date.getTime())) {
                        return 'recently';
                      }
                      return formatDistanceToNow(date, { addSuffix: true });
                    } catch (error) {
                      return 'recently';
                    }
                  })()}</span>
                </div>
                
                {media.metadata?.originalAuthor && media.metadata.originalAuthor !== media.uploader.displayName && (
                  <div className="flex items-center space-x-3 text-[var(--text-secondary)]">
                    <User className="w-4 h-4 text-[var(--accent-purple)]" />
                    <span>Originally by {media.metadata.originalAuthor}</span>
                  </div>
                )}

                <div className="flex items-center space-x-3 text-[var(--text-secondary)]">
                  <Globe className="w-4 h-4 text-[var(--accent-green)]" />
                  <span>Public content</span>
                </div>
              </div>
            </div>

            {/* File Details */}
            <div className="card-gaming p-6">
              <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-[var(--accent-blue)]" />
                File Details
              </h3>
              
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Format:</span>
                  <span className="text-[var(--text-primary)] font-medium bg-[var(--bg-secondary)] px-2 py-1 rounded">
                    {primaryFile.format?.toUpperCase() || 'Unknown'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Size:</span>
                  <span className="text-[var(--text-primary)] font-medium">{formatFileSize(primaryFile.size)}</span>
                </div>
                
                {media.metadata?.duration && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-secondary)]">Duration:</span>
                    <span className="text-[var(--text-primary)] font-medium flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatTime(media.metadata.duration)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Platform:</span>
                  <span className="text-[var(--text-primary)] font-medium capitalize flex items-center">
                    <span className="mr-2">{getPlatformIcon()}</span>
                    {media.platform}
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-primary)]">
                <button
                  onClick={handleDownload}
                  className="w-full btn btn-primary flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download File</span>
                </button>
              </div>
            </div>

            {/* Tags */}
            {media.tags && media.tags.length > 0 && (
              <div className="card-gaming p-6">
                <h3 className="font-bold text-[var(--text-primary)] mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {media.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] text-sm rounded-full border border-[var(--accent-blue)]/30 hover-lift"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 