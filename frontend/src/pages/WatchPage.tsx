import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { publicAPI } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import MediaPlayer, { MediaPlayerRef } from '../components/MediaPlayer'
import PlyrVideoPlayer from '../components/PlyrVideoPlayer'
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
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Shuffle,
  MoreHorizontal
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import axios from 'axios'

interface Caption {
  id: string;
  language: string;
  segments: CaptionSegment[];
}

interface CaptionSegment {
  id: string;
  startTime: number;
  text: string;
  confidence?: number;
}

interface MediaItem {
  id: string;
  title: string;
  description?: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  user: {
    displayName: string;
    photoURL?: string;
  };
  files: Array<{
    downloadUrl: string;
    mimeType: string;
  }>;
}

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const { user, getToken } = useAuth()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [mediaItem, setMediaItem] = useState<MediaItem | null>(null)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [liked, setLiked] = useState(false)
  const [showCaptions, setShowCaptions] = useState(true)
  const [comments, setComments] = useState<any[]>([])
  const [volume, setVolume] = useState(0.8)
  const [showCommentsModal, setShowCommentsModal] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [commentTransition, setCommentTransition] = useState(false)
  const mediaPlayerRef = useRef<MediaPlayerRef>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const activeLyricRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (id) {
      fetchMedia()
      fetchCaptions()
      fetchComments()
      trackView()
    }
  }, [id])

  const fetchMedia = async () => {
    try {
      const response = await axios.get(`/api/media/public`)
      const item = response.data.data.find((m: any) => m.id === id)
      if (item) {
        setMediaItem(item)
      }
    } catch (error) {
      console.error('Error fetching media:', error)
    }
  }

  const fetchCaptions = async () => {
    try {
      console.log(`🎬 Fetching captions for media item: ${id}`);
      const response = await axios.get(`/api/media/${id}/captions`)
      console.log(`✅ Captions loaded:`, response.data.data);
      setCaptions(response.data.data)
    } catch (error) {
      console.error('❌ Error fetching captions:', error)
    }
  }

  const fetchComments = async () => {
    try {
      const response = await axios.get(`/api/media/${id}/comments`)
      setComments(response.data.data)
    } catch (error) {
      console.error('Error fetching comments:', error)
    }
  }

  const trackView = async () => {
    try {
      const token = user ? await getToken() : null
      await axios.post(`/api/media/${id}/views`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    } catch (error) {
      console.error('Error tracking view:', error)
    }
  }

  const handleTimeUpdate = useCallback(() => {
    if (mediaPlayerRef.current) {
      setCurrentTime(mediaPlayerRef.current.currentTime)
      setDuration(mediaPlayerRef.current.duration)
    }
  }, [])

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const getCurrentCaption = () => {
    if (!captions.length || !showCaptions) return null
    
    const caption = captions[0]
    const segments = caption.segments
    
    const currentSegment = segments.find((segment, index) => {
      const endTime = index < segments.length - 1 ? segments[index + 1].startTime : segment.startTime + 5.0
      return currentTime >= segment.startTime && currentTime <= endTime
    })
    
    return currentSegment
  }

  // Auto-scroll to active lyric
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeLyric = activeLyricRef.current
      
      const containerHeight = container.clientHeight
      const lyricTop = activeLyric.offsetTop
      const lyricHeight = activeLyric.clientHeight
      
      // Center the active lyric
      const scrollTop = lyricTop - (containerHeight / 2) + (lyricHeight / 2)
      
      container.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      })
    }
  }, [currentTime, captions])

  // Get lyrics opacity based on proximity to current time
  const getLyricOpacity = (segment: CaptionSegment, index: number, segments: CaptionSegment[]) => {
    const endTime = index < segments.length - 1 ? segments[index + 1].startTime : segment.startTime + 5.0
    
    const isActive = currentTime >= segment.startTime && currentTime <= endTime
    const isPast = currentTime > endTime
    const isFuture = currentTime < segment.startTime
    const timeDiff = Math.min(
      Math.abs(currentTime - segment.startTime),
      Math.abs(currentTime - endTime)
    )
    
    if (isActive) return 1
    if (isPast && timeDiff <= 10) return 0.6
    if (isFuture && timeDiff <= 10) return 0.4
    return 0.2
  }

  const handleShare = async () => {
    try {
      if (navigator.share && mediaItem) {
        await navigator.share({
          title: mediaItem.title,
          text: `Check out "${mediaItem.title}" on ArchiveDrop`,
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
    if (mediaItem?.files?.[0]?.downloadUrl) {
      window.open(mediaItem.files[0].downloadUrl, '_blank')
      toast.success('⬇️ Download started!')
    }
  }

  const handleLike = async () => {
    if (!user) {
      toast.error('Please sign in to like content')
      return
    }
    try {
      const token = await getToken()
      await axios.post(`/api/media/${id}/like`, 
        { liked: !liked },
        { headers: { Authorization: `Bearer ${token}` }}
      )
      setLiked(!liked)
    } catch (error) {
      console.error('Error toggling like:', error)
    }
  }

  const togglePlayPause = () => {
    if (mediaPlayerRef.current) {
      if (isPlaying) {
        mediaPlayerRef.current.pause()
      } else {
        mediaPlayerRef.current.play()
      }
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.seekTo(newTime)
    }
  }

  const handleAddComment = async () => {
    if (!user || !newComment.trim()) {
      if (!user) {
        toast.error('Please sign in to comment')
      }
      return
    }
    
    try {
      const token = await getToken()
      const response = await axios.post(`/api/media/${id}/comments`, 
        { content: newComment },
        { headers: { Authorization: `Bearer ${token}` }}
      )
      setComments([response.data.data, ...comments])
      setNewComment('')
      toast.success('Comment added!')
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  const getRandomComment = () => {
    if (comments.length === 0) return null
    return comments[Math.floor(Math.random() * comments.length)]
  }

  const getCurrentDisplayComment = () => {
    if (comments.length === 0) {
      return {
        user: { displayName: 'Anonymous', photoURL: null },
        content: 'Be the first to comment on this track! Share your thoughts...',
        isPlaceholder: true
      }
    }
    return comments[currentCommentIndex % comments.length]
  }

  // Smooth comment transition effect
  useEffect(() => {
    if (comments.length <= 1) return

    const interval = setInterval(() => {
      setCommentTransition(true)
      
      setTimeout(() => {
        setCurrentCommentIndex(prev => (prev + 1) % comments.length)
        setCommentTransition(false)
      }, 300) // Half of transition duration
    }, 8000) // Change comment every 8 seconds

    return () => clearInterval(interval)
  }, [comments.length])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-600/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-6"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Loading Music</h2>
          <p className="text-gray-400">Preparing your audio experience...</p>
        </div>
      </div>
    )
  }

  if (error || !mediaData?.data.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎵</div>
          <h1 className="text-2xl font-bold text-white mb-2">Track Not Found</h1>
          <p className="text-gray-400 mb-6">This track may have been removed or made private.</p>
          <Link to="/" className="px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors inline-flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Link>
        </div>
      </div>
    )
  }

  const primaryFile = mediaData.data.data.files[0]
  const isAudio = primaryFile.mimeType.startsWith('audio/')
  const isVideo = primaryFile.mimeType.startsWith('video/')

  // Video content with Plyr player
  if (isVideo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]"></div>
        </div>

        {/* Navigation */}
        <div className="relative z-10 p-6">
          <Link
            to="/"
            className="inline-flex items-center text-gray-300 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Library
          </Link>
        </div>

        {/* Video Player Container */}
        <div className="relative z-10 container mx-auto px-6 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Video Player */}
            <div className="mb-8">
              <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                <PlyrVideoPlayer
                  src={primaryFile.downloadUrl}
                  title={mediaData.data.data.title}
                  poster={mediaData.data.data.thumbnailUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onDurationChange={(duration) => setDuration(duration)}
                  className="max-w-[50vh] h-full m-auto"
                />
              </div>
            </div>

            {/* Video Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Title and Stats */}
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    {mediaData.data.data.title}
                  </h1>

                  <div className="flex items-center space-x-6 text-gray-400 mb-4">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-5 h-5" />
                      <span>{mediaData.data.data.viewCount || 0} views</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Heart
                        className={`w-5 h-5 ${
                          liked ? "fill-current text-red-500" : ""
                        }`}
                      />
                      <span>{mediaData.data.data.likeCount || 0}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MessageCircle className="w-5 h-5" />
                      <span>{comments.length} comments</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleLike}
                      className={`flex items-center space-x-2 px-6 py-3 rounded-full transition-all ${
                        liked
                          ? "bg-red-600/20 text-red-400 border border-red-600/30"
                          : "bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700"
                      }`}
                    >
                      <Heart
                        className={`w-5 h-5 ${liked ? "fill-current" : ""}`}
                      />
                      <span>{liked ? "Liked" : "Like"}</span>
                    </button>

                    <button
                      onClick={handleShare}
                      className="flex items-center space-x-2 px-6 py-3 bg-gray-800 text-gray-300 rounded-full hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                      <span>Share</span>
                    </button>

                    <button
                      onClick={handleDownload}
                      className="flex items-center space-x-2 px-6 py-3 bg-gray-800 text-gray-300 rounded-full hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {/* Description */}
                {mediaData.data.data.description && (
                  <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Description</h3>
                      {mediaData.data.data.description.length > 200 && (
                        <button
                          onClick={() =>
                            setShowFullDescription(!showFullDescription)
                          }
                          className="text-purple-400 hover:text-purple-300 text-sm"
                        >
                          {showFullDescription ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                    <p className="text-gray-300 leading-relaxed">
                      {showFullDescription
                        ? mediaData.data.data.description
                        : mediaData.data.data.description.slice(0, 200) +
                          (mediaData.data.data.description.length > 200
                            ? "..."
                            : "")}
                    </p>
                  </div>
                )}

                {/* Captions/Transcript */}
                {captions.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold mb-4">Transcript</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                      {captions[0].segments.map((segment, index) => {
                        const segments = captions[0].segments;
                        const endTime =
                          index < segments.length - 1
                            ? segments[index + 1].startTime
                            : segment.startTime + 5.0;
                        const isActive =
                          currentTime >= segment.startTime &&
                          currentTime <= endTime;

                        return (
                          <div
                            key={segment.id}
                            className={`cursor-pointer p-3 rounded-lg transition-all duration-300 ${
                              isActive
                                ? "bg-purple-600/20 border border-purple-600/30"
                                : "hover:bg-gray-700/50"
                            }`}
                            onClick={() => {
                              // TODO: Implement seek to time for video player
                              console.log("Seek to:", segment.startTime);
                            }}
                          >
                            <div className="flex items-start space-x-3">
                              <span className="text-purple-400 text-sm font-mono min-w-[60px]">
                                {formatTime(segment.startTime)}
                              </span>
                              <p
                                className={`text-sm leading-relaxed ${
                                  isActive ? "text-white" : "text-gray-300"
                                }`}
                              >
                                {segment.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-1">
                {/* Creator Info */}
                <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm mb-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <img
                      src={
                        mediaData.data.data.user?.photoURL ||
                        "/default-avatar.png"
                      }
                      alt={mediaData.data.data.user?.displayName || "Creator"}
                      className="w-12 h-12 rounded-full border-2 border-purple-600/50"
                    />
                    <div>
                      <h4 className="font-semibold text-white">
                        {mediaData.data.data.user?.displayName ||
                          "Unknown Creator"}
                      </h4>
                      <p className="text-gray-400 text-sm">Content Creator</p>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
                  <h4 className="font-semibold mb-4">Video Stats</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Views</span>
                      <span className="text-white">
                        {mediaData.data.data.viewCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Likes</span>
                      <span className="text-white">
                        {mediaData.data.data.likeCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Comments</span>
                      <span className="text-white">{comments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Duration</span>
                      <span className="text-white">{formatTime(duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Comment Card */}
        <div className="fixed bottom-6 right-6 z-20">
          <div
            className={`bg-black/80 backdrop-blur-md rounded-2xl p-6 max-w-md cursor-pointer hover:bg-black/90 transition-all duration-500 border border-white/10 transform ${
              commentTransition
                ? "scale-95 opacity-70"
                : "scale-100 opacity-100"
            }`}
            onClick={() => setShowCommentsModal(true)}
          >
            <div className="flex items-start space-x-4">
              <div
                className={`transition-all duration-500 ${
                  commentTransition
                    ? "opacity-0 scale-90"
                    : "opacity-100 scale-100"
                }`}
              >
                <img
                  src={
                    getCurrentDisplayComment()?.user?.photoURL ||
                    "/default-avatar.png"
                  }
                  alt="Commenter"
                  className="w-12 h-12 rounded-full border border-white/20"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`flex items-center space-x-3 mb-2 transition-all duration-500 ${
                    commentTransition
                      ? "opacity-0 translate-y-2"
                      : "opacity-100 translate-y-0"
                  }`}
                >
                  <span className="text-white text-base font-medium truncate">
                    {getCurrentDisplayComment()?.user?.displayName ||
                      "Anonymous"}
                  </span>
                  <MessageCircle
                    className={`w-5 h-5 ${
                      getCurrentDisplayComment()?.isPlaceholder
                        ? "text-purple-400 animate-pulse"
                        : "text-purple-400"
                    }`}
                  />
                </div>
                <p
                  className={`text-gray-300 text-sm line-clamp-3 leading-relaxed transition-all duration-500 ${
                    commentTransition
                      ? "opacity-0 translate-y-2"
                      : "opacity-100 translate-y-0"
                  } ${
                    getCurrentDisplayComment()?.isPlaceholder
                      ? "italic text-gray-400"
                      : ""
                  }`}
                >
                  {getCurrentDisplayComment()?.content}
                </p>
              </div>
            </div>
            <div
              className={`mt-4 flex items-center justify-between text-xs text-gray-400 transition-all duration-500 ${
                commentTransition
                  ? "opacity-0 translate-y-2"
                  : "opacity-100 translate-y-0"
              }`}
            >
              <span className="font-medium mr-4">
                {comments.length === 0
                  ? "No comments yet"
                  : `${comments.length} comment${
                      comments.length !== 1 ? "s" : ""
                    }`}
              </span>
              <div className="flex items-center space-x-4">
                {comments.length > 1 &&
                  !getCurrentDisplayComment()?.isPlaceholder && (
                    <div className="flex space-x-1.5">
                      {Array.from({ length: Math.min(comments.length, 3) }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                              i ===
                              currentCommentIndex % Math.min(comments.length, 3)
                                ? "bg-purple-400"
                                : "bg-gray-600"
                            }`}
                          />
                        )
                      )}
                    </div>
                  )}
                <span className="text-purple-300 font-medium">
                  {getCurrentDisplayComment()?.isPlaceholder
                    ? "Tap to comment"
                    : "View all"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Comments Modal */}
        {showCommentsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-white/10">
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white flex items-center">
                    <MessageCircle className="w-6 h-6 mr-3 text-purple-400" />
                    Comments ({comments.length})
                  </h2>
                  <button
                    onClick={() => setShowCommentsModal(false)}
                    className="text-gray-400 hover:text-white transition-colors p-2"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Add Comment Form */}
              {user ? (
                <div className="p-6 border-b border-gray-700">
                  <div className="flex space-x-4">
                    <img
                      src={user.photoURL || "/default-avatar.png"}
                      alt={user.displayName || "You"}
                      className="w-12 h-12 rounded-full border-2 border-purple-600/50"
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
                          onClick={handleAddComment}
                          disabled={!newComment.trim()}
                          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Comment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 border-b border-gray-700 text-center">
                  <p className="text-gray-300 mb-4">
                    Sign in to leave a comment
                  </p>
                  <Link
                    to="/login"
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors inline-block"
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto max-h-96 p-6 space-y-6">
                {comments.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-gray-500" />
                    </div>
                    <p className="text-gray-300 text-lg">No comments yet</p>
                    <p className="text-gray-500 text-sm">
                      Be the first to share your thoughts!
                    </p>
                  </div>
                ) : (
                  comments.map((comment: any) => (
                    <div
                      key={comment.id}
                      className="flex space-x-4 p-4 bg-gray-800 rounded-xl border border-gray-700"
                    >
                      <img
                        src={comment.user.photoURL || "/default-avatar.png"}
                        alt={comment.user.displayName}
                        className="w-10 h-10 rounded-full border border-gray-600"
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
                                  return "Recently";
                                }
                                return formatDistanceToNow(date, {
                                  addSuffix: true,
                                });
                              } catch (error) {
                                return "Recently";
                              }
                            })()}
                          </span>
                        </div>
                        <p className="text-gray-300 leading-relaxed">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Styles */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(139, 92, 246, 0.6);
            border-radius: 3px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(139, 92, 246, 0.8);
          }

          .line-clamp-3 {
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </div>
    );
  }

  // Audio content - use music interface
  if (!isAudio) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📁</div>
          <h1 className="text-2xl font-bold text-white mb-2">Unsupported Content</h1>
          <p className="text-gray-400 mb-6">This content type is not supported for playback.</p>
          <Link to="/" className="px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors inline-flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]"></div>
      </div>

      {/* Navigation */}
      <div className="relative z-10 p-6">
        <Link 
          to="/" 
          className="inline-flex items-center text-gray-300 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      {/* Main Player Interface */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Side - Album Art & Controls */}
            <div className="flex flex-col items-center space-y-8">
              {/* Album Art */}
              <div className="relative group">
                <div className="w-80 h-80 md:w-96 md:h-96 rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 shadow-2xl overflow-hidden">
                  <div className="w-full h-full flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="text-8xl">🎵</div>
                  </div>
                  
                  {/* Play/Pause Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button
                      onClick={togglePlayPause}
                      className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                    >
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-black ml-1" />
                      ) : (
                        <Play className="w-8 h-8 text-black ml-1" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Track Info */}
              <div className="text-center space-y-2">
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  {mediaData.data.data.title}
                </h1>
                <p className="text-gray-400 text-lg">
                  {mediaData.data.data.user?.displayName || 'Unknown Artist'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md space-y-2">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer progress-bar"
                    style={{
                      background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(currentTime / (duration || 100)) * 100}%, #374151 ${(currentTime / (duration || 100)) * 100}%, #374151 100%)`
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-8">
                <button className="text-gray-400 hover:text-white transition-colors">
                  <Shuffle className="w-5 h-5" />
                </button>
                
                <button className="text-gray-400 hover:text-white transition-colors">
                  <SkipBack className="w-6 h-6" />
                </button>
                
                <button
                  onClick={togglePlayPause}
                  className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-black" />
                  ) : (
                    <Play className="w-6 h-6 text-black ml-1" />
                  )}
                </button>
                
                <button className="text-gray-400 hover:text-white transition-colors">
                  <SkipForward className="w-6 h-6" />
                </button>
                
                <button className="text-gray-400 hover:text-white transition-colors">
                  <Repeat className="w-5 h-5" />
                </button>
              </div>

              {/* Secondary Controls */}
              <div className="flex items-center space-x-6">
                <button
                  onClick={handleLike}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                    liked
                      ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
                  <span>{mediaData.data.data.likeCount || 0}</span>
                </button>

                <button
                  onClick={handleShare}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                </button>

                <button
                  onClick={handleDownload}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Download className="w-5 h-5" />
                </button>

                <button className="text-gray-400 hover:text-white transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Right Side - Synchronized Lyrics */}
            <div className="flex flex-col h-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Lyrics</h2>
                <p className="text-gray-400 text-sm">
                  {captions.length > 0 ? `${captions[0].segments.length} lines • Auto-generated` : 'No lyrics available'}
                </p>
              </div>

              {captions.length > 0 ? (
                <div 
                  ref={lyricsContainerRef}
                  className="flex-1 overflow-y-auto space-y-6 max-h-96 pr-4 custom-scrollbar"
                >
                  {captions[0].segments.map((segment, index) => {
                    const segments = captions[0].segments
                    const endTime = index < segments.length - 1 ? segments[index + 1].startTime : segment.startTime + 5.0
                    const isActive = currentTime >= segment.startTime && currentTime <= endTime
                    const opacity = getLyricOpacity(segment, index, captions[0].segments)
                    
                    return (
                      <div
                        key={segment.id}
                        ref={isActive ? activeLyricRef : null}
                        className={`cursor-pointer transition-all duration-500 ease-out ${
                          isActive ? 'transform scale-105' : ''
                        }`}
                        style={{ opacity }}
                        onClick={() => {
                          if (mediaPlayerRef.current) {
                            mediaPlayerRef.current.seekTo(segment.startTime)
                          }
                        }}
                      >
                        <div className="group">
                          <div className="text-sm text-center text-gray-500 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            {formatTime(segment.startTime)}
                          </div>
                          <p className={`text-lg text-center md:text-xl leading-relaxed transition-all duration-300 ${
                            isActive 
                              ? 'text-white font-medium bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' 
                              : 'text-gray-300'
                          } hover:text-white`}>
                            {segment.text}
                          </p>
                          {segment.confidence && (
                            <div className="text-xs text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {Math.round(segment.confidence * 100)}% confidence
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <div className="text-6xl mb-4 opacity-20">🎤</div>
                    <p className="text-gray-400 text-lg">No lyrics available</p>
                    <p className="text-gray-500 text-sm mt-2">Lyrics will appear here when available</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Comment Card */}
      <div className="fixed bottom-6 right-6 z-20">
        <div 
          className={`bg-black/80 backdrop-blur-md rounded-2xl p-6 max-w-md cursor-pointer hover:bg-black/90 transition-all duration-500 border border-white/10 transform ${
            commentTransition ? 'scale-95 opacity-70' : 'scale-100 opacity-100'
          }`}
          onClick={() => setShowCommentsModal(true)}
        >
          <div className="flex items-start space-x-4">
            <div className={`transition-all duration-500 ${commentTransition ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
              <img
                src={getCurrentDisplayComment()?.user?.photoURL || '/default-avatar.png'}
                alt="Commenter"
                className="w-12 h-12 rounded-full border border-white/20"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`flex items-center space-x-3 mb-2 transition-all duration-500 ${
                commentTransition ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
              }`}>
                <span className="text-white text-base font-medium truncate">
                  {getCurrentDisplayComment()?.user?.displayName || 'Anonymous'}
                </span>
                <MessageCircle className={`w-5 h-5 ${getCurrentDisplayComment()?.isPlaceholder ? 'text-purple-400 animate-pulse' : 'text-purple-400'}`} />
              </div>
              <p className={`text-gray-300 text-sm line-clamp-3 leading-relaxed transition-all duration-500 ${
                commentTransition ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
              } ${getCurrentDisplayComment()?.isPlaceholder ? 'italic text-gray-400' : ''}`}>
                {getCurrentDisplayComment()?.content}
              </p>
            </div>
          </div>
          <div className={`mt-4 flex items-center justify-between text-xs text-gray-400 transition-all duration-500 ${
            commentTransition ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
          }`}>
            <span className="font-medium mr-4">
              {comments.length === 0 
                ? 'No comments yet' 
                : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`
              }
            </span>
            <div className="flex items-center space-x-4">
              {comments.length > 1 && !getCurrentDisplayComment()?.isPlaceholder && (
                <div className="flex space-x-1.5">
                  {Array.from({ length: Math.min(comments.length, 3) }).map((_, i) => (
                    <div 
                      key={i}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        i === currentCommentIndex % Math.min(comments.length, 3) 
                          ? 'bg-purple-400' 
                          : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              )}
              <span className="text-purple-300 font-medium">
                {getCurrentDisplayComment()?.isPlaceholder ? 'Tap to comment' : 'View all'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Comments Modal */}
      {showCommentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-white/10">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center">
                  <MessageCircle className="w-6 h-6 mr-3 text-purple-400" />
                  Comments ({comments.length})
                </h2>
                <button
                  onClick={() => setShowCommentsModal(false)}
                  className="text-gray-400 hover:text-white transition-colors p-2"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Add Comment Form */}
            {user ? (
              <div className="p-6 border-b border-gray-700">
                <div className="flex space-x-4">
                  <img
                    src={user.photoURL || '/default-avatar.png'}
                    alt={user.displayName || 'You'}
                    className="w-12 h-12 rounded-full border-2 border-purple-600/50"
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
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
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
            <div className="flex-1 overflow-y-auto max-h-96 p-6 space-y-6">
              {comments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-300 text-lg">No comments yet</p>
                  <p className="text-gray-500 text-sm">Be the first to share your thoughts!</p>
                </div>
              ) : (
                comments.map((comment: any) => (
                  <div key={comment.id} className="flex space-x-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <img
                      src={comment.user.photoURL || '/default-avatar.png'}
                      alt={comment.user.displayName}
                      className="w-10 h-10 rounded-full border border-gray-600"
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
        </div>
      )}

      {/* Hidden Audio Player */}
      <div className="hidden">
        <ErrorBoundary>
          <MediaPlayer
            ref={mediaPlayerRef}
            src={primaryFile.downloadUrl}
            type="audio"
            title={mediaData.data.data.title}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
          />
        </ErrorBoundary>
      </div>

      {/* Custom Styles */}
      <style>{`
        .progress-bar::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
        }
        
        .progress-bar::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.6);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.8);
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
} 