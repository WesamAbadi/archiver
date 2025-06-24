import React, { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { publicAPI } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
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
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Clock,
  FileText,
  Globe,
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isMediaLoaded, setIsMediaLoaded] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)

  // Close volume slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Initialize volume when component mounts
  useEffect(() => {
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      mediaElement.volume = volume
    }
  }, [volume])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys when not typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault()
          togglePlay()
          break
        case 'ArrowUp':
          event.preventDefault()
          setVolume(prev => Math.min(1, prev + 0.1))
          break
        case 'ArrowDown':
          event.preventDefault()
          setVolume(prev => Math.max(0, prev - 0.1))
          break
        case 'ArrowLeft':
          event.preventDefault()
          const mediaElement1 = audioRef.current || videoRef.current
          if (mediaElement1) {
            mediaElement1.currentTime = Math.max(0, mediaElement1.currentTime - 10)
          }
          break
        case 'ArrowRight':
          event.preventDefault()
          const mediaElement2 = audioRef.current || videoRef.current
          if (mediaElement2) {
            mediaElement2.currentTime = Math.min(mediaElement2.duration, mediaElement2.currentTime + 10)
          }
          break
        case 'KeyM':
          event.preventDefault()
          toggleMute()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [volume])

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
      onSuccess: () => {
        queryClient.invalidateQueries(['public-media', id])
        toast.success('👍 Liked!')
      },
    }
  )

  // Add comment mutation
  const commentMutation = useMutation(
    (content: string) => publicAPI.addComment(id!, content),
    {
      onSuccess: () => {
        setComment('')
        queryClient.invalidateQueries(['public-media', id])
        toast.success('💬 Comment added!')
      },
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

  // Audio/Video controls
  const togglePlay = () => {
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      if (isPlaying) {
        mediaElement.pause()
      } else {
        setIsBuffering(true)
        mediaElement.play().catch((error) => {
          console.error('Play failed:', error)
          toast.error('Failed to play media')
          setIsBuffering(false)
        })
      }
    }
  }

  const toggleMute = () => {
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      mediaElement.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      mediaElement.volume = newVolume
      if (newVolume === 0) {
        setIsMuted(true)
        mediaElement.muted = true
      } else if (isMuted) {
        setIsMuted(false)
        mediaElement.muted = false
      }
    }
  }

  const handleTimeUpdate = () => {
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      setCurrentTime(mediaElement.currentTime)
      setDuration(mediaElement.duration || 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    const mediaElement = audioRef.current || videoRef.current
    if (mediaElement) {
      mediaElement.currentTime = newTime
    }
  }

  // Media event handlers
  const handleLoadStart = () => {
    setIsBuffering(true)
    setIsMediaLoaded(false)
  }

  const handleLoadedData = () => {
    setIsMediaLoaded(true)
    setIsBuffering(false)
  }

  const handleWaiting = () => {
    setIsBuffering(true)
  }

  const handleCanPlay = () => {
    setIsBuffering(false)
  }

  const handlePlay = () => {
    setIsPlaying(true)
    setIsBuffering(false)
  }

  const handlePause = () => {
    setIsPlaying(false)
  }

  const handleVolumeClick = () => {
    setShowVolumeSlider(!showVolumeSlider)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
                  <div className="w-full h-full flex flex-col items-center justify-center relative">
                    <audio
                      ref={audioRef}
                      src={primaryFile.downloadUrl}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleTimeUpdate}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onLoadStart={handleLoadStart}
                      onLoadedData={handleLoadedData}
                      onWaiting={handleWaiting}
                      onCanPlay={handleCanPlay}
                      className="hidden"
                    />
                    
                    {/* Loading State */}
                    {!isMediaLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]/80 backdrop-blur-sm z-20">
                        <div className="text-center">
                          <div className="w-16 h-16 border-4 border-[var(--accent-blue)]/20 border-t-[var(--accent-blue)] rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-[var(--text-primary)] font-medium">Loading audio...</p>
                          <p className="text-[var(--text-secondary)] text-sm">Please wait</p>
                        </div>
                      </div>
                    )}

                    {/* Buffering Indicator */}
                    {isBuffering && isMediaLoaded && (
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className="w-12 h-12 border-4 border-[var(--accent-purple)]/20 border-t-[var(--accent-purple)] rounded-full animate-spin"></div>
                      </div>
                    )}
                    
                    {/* Audio Visualization */}
                    <div className="w-32 h-32 bg-gradient-gaming rounded-full flex items-center justify-center mb-8 shadow-gaming relative">
                      <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center">
                        <span className="text-4xl">🎵</span>
                      </div>
                      {isPlaying && (
                        <div className="absolute inset-0 border-4 border-[var(--accent-blue)]/30 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    
                    {/* Play Button */}
                    <button
                      onClick={togglePlay}
                      disabled={!isMediaLoaded}
                      className="w-16 h-16 bg-[var(--accent-blue)] hover:bg-[var(--accent-purple)] rounded-full flex items-center justify-center text-white transition-all shadow-gaming hover-lift mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isBuffering ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : isPlaying ? (
                        <Pause className="w-8 h-8" />
                      ) : (
                        <Play className="w-8 h-8 ml-1" />
                      )}
                    </button>
                    
                    {/* Progress Bar */}
                    <div className="w-full max-w-md px-8">
                      <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        disabled={!isMediaLoaded}
                        className="w-full h-2 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer mb-4 disabled:opacity-50"
                        style={{
                          background: `linear-gradient(to right, var(--accent-blue) 0%, var(--accent-blue) ${(currentTime / (duration || 1)) * 100}%, var(--bg-secondary) ${(currentTime / (duration || 1)) * 100}%, var(--bg-secondary) 100%)`
                        }}
                      />
                      <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                        <span className="font-mono">{formatTime(currentTime)}</span>
                        <span className="font-mono">{formatTime(duration)}</span>
                      </div>
                    </div>
                    
                    {/* Volume Control */}
                    <div className="absolute bottom-4 right-4 flex items-center space-x-2">
                      <div className="relative" ref={volumeRef}>
                        <button
                          onClick={handleVolumeClick}
                          className="p-2 bg-black/50 rounded-lg text-white hover:bg-black/75 transition-colors"
                        >
                          {isMuted || volume === 0 ? (
                            <VolumeX className="w-4 h-4" />
                          ) : volume < 0.5 ? (
                            <Volume2 className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                        
                        {/* Volume Slider */}
                        {showVolumeSlider && (
                          <div className="absolute bottom-full right-0 mb-2 p-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-gaming">
                            <div className="flex flex-col items-center space-y-2">
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-20 h-2 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer transform rotate-0"
                                style={{
                                  background: `linear-gradient(to right, var(--accent-blue) 0%, var(--accent-blue) ${volume * 100}%, var(--bg-secondary) ${volume * 100}%, var(--bg-secondary) 100%)`
                                }}
                              />
                              <span className="text-xs text-[var(--text-secondary)] font-mono">
                                {Math.round(volume * 100)}%
                              </span>
                              <button
                                onClick={toggleMute}
                                className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-purple)] transition-colors"
                              >
                                {isMuted ? 'Unmute' : 'Mute'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Audio Info */}
                    {isMediaLoaded && (
                      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[var(--accent-green)] animate-pulse' : 'bg-[var(--text-muted)]'}`}></div>
                          <span>{isPlaying ? 'Playing' : isBuffering ? 'Buffering...' : 'Paused'}</span>
                        </div>
                      </div>
                    )}

                    {/* Keyboard Shortcuts Help */}
                    <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-xs">
                      <div className="space-y-1">
                        <div><span className="font-mono bg-white/20 px-1 rounded">Space</span> Play/Pause</div>
                        <div><span className="font-mono bg-white/20 px-1 rounded">M</span> Mute</div>
                        <div><span className="font-mono bg-white/20 px-1 rounded">↑↓</span> Volume</div>
                        <div><span className="font-mono bg-white/20 px-1 rounded">←→</span> Seek ±10s</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Video Player */}
                {isVideo && (
                  <div className="w-full h-full relative">
                    <video
                      ref={videoRef}
                      src={primaryFile.downloadUrl}
                      controls
                      className="w-full h-full object-contain"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleTimeUpdate}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onLoadStart={handleLoadStart}
                      onLoadedData={handleLoadedData}
                      onWaiting={handleWaiting}
                      onCanPlay={handleCanPlay}
                    />
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