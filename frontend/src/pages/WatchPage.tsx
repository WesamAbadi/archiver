import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { publicAPI } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import MediaPlayer, { MediaPlayerRef } from '../components/MediaPlayer'
import PlyrVideoPlayer from '../components/PlyrVideoPlayer'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageContainer, Card, EnhancedCommentSection } from '../components/common'
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
  endTime: number;
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
  engagement?: {
    likes: number;
    comments: number;
    isLiked: boolean;
  };
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
  const [likeCount, setLikeCount] = useState(0)
  const [showCaptions, setShowCaptions] = useState(true)
  const [comments, setComments] = useState<any[]>([])
  const [volume, setVolume] = useState(0.8)
  const [showCommentsModal, setShowCommentsModal] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [commentTransition, setCommentTransition] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const mediaPlayerRef = useRef<MediaPlayerRef>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const activeLyricRef = useRef<HTMLDivElement>(null)

  // Detect if text is Arabic/RTL
  const isRTL = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
  }

  // Format time with consistent 3 decimal precision
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00.000';
    
    const totalSeconds = Math.max(0, seconds);
    
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
    
    return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  // Get media item with engagement data
  const { data: mediaData, isLoading, error } = useQuery(
    ['public-media', id],
    () => publicAPI.getMediaItem(id!),
    {
      enabled: !!id,
      onSuccess: (data) => {
        if (data?.data?.success) {
          const item = data.data.data;
          setLiked(item.engagement?.isLiked || false);
          setLikeCount(item.engagement?.likes || item.likeCount || 0);
        }
      }
    }
  )

  // Like mutation
  const likeMutation = useMutation(
    () => publicAPI.toggleLike(id!),
    {
      onMutate: async () => {
        // Optimistic update
        const previousLiked = liked;
        const previousCount = likeCount;
        
        setLiked(!liked);
        setLikeCount(prev => liked ? prev - 1 : prev + 1);
        
        return { previousLiked, previousCount };
      },
      onError: (err, variables, context) => {
        // Revert on error
        if (context) {
          setLiked(context.previousLiked);
          setLikeCount(context.previousCount);
        }
        toast.error('Failed to update like');
      },
      onSuccess: (data) => {
        // Update with server response
        if (data?.data?.success) {
          setLiked(data.data.data.isLiked);
          setLikeCount(data.data.data.engagement?.likes || likeCount);
          toast.success(data.data.data.isLiked ? 'Added to favorites!' : 'Removed from favorites');
        }
      }
    }
  );

  useEffect(() => {
    if (id) {
      fetchCaptions()
      fetchComments()
      trackView()
    }
  }, [id])

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
    setCommentsLoading(true);
    try {
      const response = await axios.get(`/api/archive/media/${id}/comments`)
      if (response.data.success) {
        setComments(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching comments:', error)
    } finally {
      setCommentsLoading(false);
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
      setCurrentTime(Number(mediaPlayerRef.current.currentTime.toFixed(3)));
      setDuration(Number(mediaPlayerRef.current.duration.toFixed(3)));
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const togglePlayPause = useCallback(() => {
    if (mediaPlayerRef.current) {
      if (isPlaying) {
        mediaPlayerRef.current.pause();
      } else {
        mediaPlayerRef.current.play();
      }
    }
  }, [isPlaying]);

  // Get current caption segment
  const getCurrentCaption = () => {
    if (!captions.length || !showCaptions) return null;
    
    const currentTimeFixed = Number(currentTime.toFixed(3));
    const caption = captions[0];
    
    return caption.segments.find((segment) => 
      currentTimeFixed >= segment.startTime && currentTimeFixed <= segment.endTime
    );
  }

  // Auto-scroll to active lyric
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeLyric = activeLyricRef.current
      
      const containerHeight = container.clientHeight
      const lyricTop = activeLyric.offsetTop
      const lyricHeight = activeLyric.clientHeight
      
      const scrollTop = lyricTop - (containerHeight / 2) + (lyricHeight / 2)
      
      container.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      })
    }
  }, [currentTime, captions])

  // Get lyrics opacity based on proximity to current time
  const getLyricOpacity = (segment: CaptionSegment) => {
    const currentTimeFixed = Number(currentTime.toFixed(3));
    const isActive = currentTimeFixed >= segment.startTime && currentTimeFixed <= segment.endTime;
    const timeDiff = Math.min(
      Math.abs(currentTimeFixed - segment.startTime),
      Math.abs(currentTimeFixed - segment.endTime)
    );
    
    let opacity = 0.2;
    
    if (isActive) {
      opacity = 1;
    } else if (timeDiff <= 2) {
      opacity = 0.6;
    } else if (timeDiff <= 5) {
      opacity = 0.4;
    }
    
    const confidence = segment.confidence || 0.8;
    return opacity * (0.5 + confidence * 0.5);
  }

  const handleShare = async () => {
    try {
      if (navigator.share && mediaData?.data?.data) {
        await navigator.share({
          title: mediaData.data.data.title,
          text: `Check out "${mediaData.data.data.title}" on ArchiveDrop`,
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
    if (mediaData?.data?.data?.files?.[0]?.downloadUrl) {
      window.open(mediaData.data.data.files[0].downloadUrl, '_blank')
      toast.success('⬇️ Download started!')
    }
  }

  const handleLike = async () => {
    if (!user) {
      toast.error('Please sign in to like content')
      return
    }
    likeMutation.mutate();
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(parseFloat(e.target.value).toFixed(3));
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.seekTo(newTime);
    }
  }

  const handleAddComment = async (content: string) => {
    if (!user) {
      toast.error('Please sign in to comment')
      return
    }
    
    try {
      const token = await getToken()
      const response = await axios.post(`/api/archive/media/${id}/comment`, 
        { content },
        { headers: { Authorization: `Bearer ${token}` }}
      )
      
      if (response.data.success) {
        // Add the new comment to the beginning of the list
        setComments([response.data.data, ...comments])
        toast.success('Comment added!')
      }
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  if (isLoading) {
    return (
      <PageContainer variant="gradient">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-purple-600/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-6"></div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Loading Content</h2>
            <p className="text-gray-400">Preparing your experience...</p>
          </div>
        </div>
      </PageContainer>
    )
  }

  if (error || !mediaData?.data.success) {
    return (
      <PageContainer variant="gradient">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-6xl mb-4">🎵</div>
            <h1 className="text-2xl font-bold text-white mb-2">Content Not Found</h1>
            <p className="text-gray-400 mb-6">This content may have been removed or made private.</p>
            <Link to="/" className="px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors inline-flex items-center">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Library
            </Link>
          </div>
        </div>
      </PageContainer>
    )
  }

  const primaryFile = mediaData.data.data.files[0]
  const isAudio = primaryFile.mimeType.startsWith('audio/')
  const isVideo = primaryFile.mimeType.startsWith('video/')

  // Video content with Plyr player
  if (isVideo) {
    return (
      <PageContainer variant="gradient">
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
              <Card variant="default" className="bg-black">
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
              </Card>
            </div>

            {/* Video Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                <Card variant="default" className="p-6">
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
                        <span>{likeCount}</span>
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
                </Card>

                {/* Description */}
                {mediaData.data.data.description && (
                  <Card variant="default" className="p-6">
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
                  </Card>
                )}

                {/* Comments Section */}
                <Card variant="default" className="p-6">
                  <EnhancedCommentSection
                    comments={comments}
                    onAddComment={handleAddComment}
                    user={user ? {
                      displayName: user.displayName || 'Anonymous',
                      photoURL: user.photoURL
                    } : null}
                    isLoading={commentsLoading}
                  />
                </Card>
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-1">
                {/* Creator Info */}
                <Card variant="default" className="p-6 mb-6">
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
                </Card>

                {/* Stats */}
                <Card variant="default" className="p-6">
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
                        {likeCount}
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
                </Card>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
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
    <PageContainer variant="gradient">
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
      <div className="relative z-10 flex-1 p-6">
        <div className="w-full max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Side - Album Art & Controls */}
            <div className="flex flex-col items-center space-y-8">
              {/* Album Art */}
              <div className="relative group">
                <div className="w-80 h-80 md:w-96 md:h-96 rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 shadow-2xl overflow-hidden">
                  {mediaData.data.data.thumbnailUrl ? (
                    <img
                      src={mediaData.data.data.thumbnailUrl}
                      alt={mediaData.data.data.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/20 backdrop-blur-sm">
                      <div className="text-8xl">🎵</div>
                    </div>
                  )}
                  
                  {/* Play/Pause Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button
                      onClick={togglePlayPause}
                      className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                    >
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-black" />
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
                <button 
                  className="text-gray-400 hover:text-white transition-colors"
                  onClick={() => {
                    toast.success('Shuffle mode toggled');
                  }}
                >
                  <Shuffle className="w-5 h-5" />
                </button>
                
                <button 
                  className="text-gray-400 hover:text-white transition-colors"
                  onClick={() => {
                    if (mediaPlayerRef.current) {
                      const newTime = Math.max(0, currentTime - 10);
                      mediaPlayerRef.current.seekTo(newTime);
                    }
                  }}
                >
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
                
                <button 
                  className="text-gray-400 hover:text-white transition-colors"
                  onClick={() => {
                    if (mediaPlayerRef.current) {
                      const newTime = Math.min(duration, currentTime + 10);
                      mediaPlayerRef.current.seekTo(newTime);
                    }
                  }}
                >
                  <SkipForward className="w-6 h-6" />
                </button>
                
                <button 
                  className="text-gray-400 hover:text-white transition-colors"
                  onClick={() => {
                    toast.success('Repeat mode toggled');
                  }}
                >
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
                  <span>{likeCount}</span>
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

            {/* Right Side - Lyrics */}
            <div className="flex flex-col h-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Lyrics</h2>
                <p className="text-gray-400 text-sm">
                  {captions.length > 0 ? (
                    <>
                      {captions[0].segments.length} segments • Auto-generated
                      {captions[0].segments.some(s => isRTL(s.text)) && (
                        <span className="ml-2 px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                          Arabic/RTL
                        </span>
                      )}
                    </>
                  ) : 'No lyrics available'}
                </p>
              </div>

              {captions.length > 0 ? (
                <div 
                  ref={lyricsContainerRef}
                  className="flex-1 overflow-y-auto space-y-6 max-h-96 pr-4 custom-scrollbar"
                >
                  {/* Display phrase-level captions naturally */}
                  {captions[0].segments.map((segment, index) => {
                    const isActive = currentTime >= segment.startTime && currentTime <= segment.endTime;
                    const isSegmentRTL = isRTL(segment.text);
                    const confidence = segment.confidence || 0.8;
                    
                    return (
                      <div
                        key={segment.id}
                        ref={isActive ? activeLyricRef : null}
                        className={`cursor-pointer transition-all duration-500 ease-out p-4 rounded-lg ${
                          isActive ? 'transform scale-105 bg-purple-600/10' : 'hover:bg-gray-800/30'
                        }`}
                        style={{
                          direction: isSegmentRTL ? 'rtl' : 'ltr',
                          opacity: getLyricOpacity(segment)
                        }}
                        onClick={() => {
                          if (mediaPlayerRef.current) {
                            mediaPlayerRef.current.seekTo(segment.startTime);
                          }
                        }}
                      >
                        <div className={`text-center ${isSegmentRTL ? 'rtl-content' : ''}`}>
                          <div className="text-sm text-white mb-3">
                            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                          </div>
                          <p className={`text-xl md:text-2xl leading-relaxed transition-all duration-300 ${
                            isActive 
                              ? 'text-white font-medium bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' 
                              : 'text-gray-300'
                          } ${isSegmentRTL ? 'font-arabic' : ''} hover:text-white`}
                          style={{ 
                            fontFamily: isSegmentRTL ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                          }}>
                            {segment.text}
                          </p>
                          {/* Show segment info */}
                          <div className="text-xs text-gray-600 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex justify-center space-x-4 text-center">
                              <span>
                                Confidence: {Math.round(confidence * 100)}%
                              </span>
                              <span>
                                Duration: {(segment.endTime - segment.startTime).toFixed(1)}s
                              </span>
                              <span>
                                Segment {index + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
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

          {/* Comments Section */}
          <div className="mt-12">
            <EnhancedCommentSection
              comments={comments}
              onAddComment={handleAddComment}
              user={user ? {
                displayName: user.displayName || 'Anonymous',
                photoURL: user.photoURL
              } : null}
              isLoading={commentsLoading}
            />
          </div>
        </div>
      </div>

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

        /* Arabic/RTL specific styles */
        .font-arabic {
          font-family: 'Noto Sans Arabic', 'Amiri', 'Arial Unicode MS', Arial, sans-serif;
          font-weight: 500;
        }

        .rtl-content {
          direction: rtl;
          text-align: right;
        }

        /* Improve Arabic text rendering */
        [lang="ar"], .font-arabic {
          font-feature-settings: "liga" 1, "calt" 1, "kern" 1;
          text-rendering: optimizeLegibility;
        }

        /* Better spacing for Arabic text */
        .rtl-content .text-lg,
        .rtl-content .text-xl {
          line-height: 1.8;
          letter-spacing: 0.02em;
        }
      `}</style>
    </PageContainer>
  )
} 