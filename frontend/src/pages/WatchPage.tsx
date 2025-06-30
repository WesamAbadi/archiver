import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { publicAPI } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import MediaPlayer, { MediaPlayerRef } from '../components/MediaPlayer'
import { useScreenSize } from '../hooks/useScreenSize'
import toast from 'react-hot-toast'
import axios from 'axios'
import { LoadingScreen } from '../components/watch/LoadingScreen'
import { ErrorScreen } from '../components/watch/ErrorScreen'
import { UnsupportedContent } from '../components/watch/UnsupportedContent'
import { VideoView } from '../components/watch/VideoView'
import { AudioView } from '../components/watch/AudioView'

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
    id: string;
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
  captionStatus?: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  captionErrorMessage?: string;
}

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const { user, getToken } = useAuth()
  const queryClient = useQueryClient()
  const { isMobile } = useScreenSize()
  const [captions, setCaptions] = useState<Caption[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [showCaptions, setShowCaptions] = useState(true)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const mediaPlayerRef = useRef<MediaPlayerRef>(null)

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

  // Get thumbnail URL for dynamic background
  const thumbnailUrl = mediaData?.data?.data?.thumbnailUrl

  // Detect if text is Arabic/RTL
  const isRTL = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
  }

  // Format time with consistent 3 decimal precision
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    
    const totalSeconds = Math.max(0, seconds);
    
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Like mutation
  const likeMutation = useMutation(() => publicAPI.toggleLike(id!), {
    onMutate: async () => {
      await queryClient.cancelQueries(['public-media', id]);
      const previousData = queryClient.getQueryData(['public-media', id]);
      
      const previousLiked = liked;
      const previousCount = likeCount;
      setLiked(!liked);
      setLikeCount((prev) => (liked ? prev - 1 : prev + 1));

      return { previousLiked, previousCount, previousData };
    },
    onError: (err, variables, context: any) => {
      if (context) {
        setLiked(context.previousLiked);
        setLikeCount(context.previousCount);
        queryClient.setQueryData(['public-media', id], context.previousData);
      }
      toast.error('Failed to update like');
    },
    onSuccess: (data) => {
      if (data?.data?.success) {
        setLiked(data.data.data.isLiked);
        setLikeCount(data.data.data.engagement?.likes || likeCount);
        toast.success(
          data.data.data.isLiked
            ? 'Added to favorites!'
            : 'Removed from favorites'
        );
      }
    },
    onSettled: () => {
        queryClient.invalidateQueries(['public-media', id]);
    }
  });

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
        setComments([response.data.data, ...comments])
        toast.success('Comment added!')
        queryClient.invalidateQueries(['public-media', id]);
      }
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  // Get current caption segment and surrounding context
  const getLyricsContext = () => {
    if (!captions.length || !showCaptions) return null;
    
    const currentTimeFixed = Number(currentTime.toFixed(3));
    const segments = captions[0].segments;
    
    // Find current active segment index
    const activeIndex = segments.findIndex((segment) => 
      currentTimeFixed >= segment.startTime && currentTimeFixed <= segment.endTime
    );
    
    // If no active segment, find the next one
    const nextIndex = activeIndex === -1 
      ? segments.findIndex(segment => currentTimeFixed < segment.startTime)
      : activeIndex;
    
    const currentIndex = nextIndex === -1 ? segments.length - 1 : nextIndex;
    
    return {
      previous: currentIndex > 0 ? segments[currentIndex - 1] : null,
      current: segments[currentIndex] || null,
      next: currentIndex < segments.length - 1 ? segments[currentIndex + 1] : null,
      activeIndex: activeIndex,
      currentIndex
    };
  };

  // Check if current user is the owner
  const isOwner = user && mediaData?.data?.data?.user?.uid && user.uid === mediaData.data.data.user.uid;

  if (isLoading) {
    return (
      <LoadingScreen thumbnailUrl={thumbnailUrl} isMobile={isMobile} />
    )
  }

  if (error || !mediaData?.data.success) {
    return (
      <ErrorScreen thumbnailUrl={thumbnailUrl} isMobile={isMobile} />
    )
  }

  const primaryFile = mediaData.data.data.files[0]
  const isAudio = primaryFile.mimeType.startsWith('audio/')
  const isVideo = primaryFile.mimeType.startsWith('video/')

  // Video content with Plyr player
  if (isVideo) {
    return (
      <VideoView
        mediaData={mediaData}
        primaryFile={primaryFile}
        thumbnailUrl={thumbnailUrl}
        isMobile={isMobile}
        liked={liked}
        likeCount={likeCount}
        comments={comments}
        duration={duration}
        setDuration={setDuration}
        handleTimeUpdate={handleTimeUpdate}
        handlePlay={handlePlay}
        handlePause={handlePause}
        handleLike={handleLike}
        handleShare={handleShare}
        handleDownload={handleDownload}
        handleAddComment={handleAddComment}
        user={user}
        commentsLoading={commentsLoading}
        formatTime={formatTime}
      />
    );
  }

  // Audio content - use music interface
  if (!isAudio) {
    return (
      <UnsupportedContent thumbnailUrl={thumbnailUrl} isMobile={isMobile} />
    )
  }

  const lyricsContext = getLyricsContext();

  return (
    <AudioView
        mediaData={mediaData}
        thumbnailUrl={thumbnailUrl}
        isMobile={isMobile}
        captions={captions}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        liked={liked}
        likeCount={likeCount}
        showCaptions={showCaptions}
        comments={comments}
        user={user}
        commentsLoading={commentsLoading}
        isOwner={isOwner}
        mediaPlayerRef={mediaPlayerRef}
        handleLike={handleLike}
        handleShare={handleShare}
        handleDownload={handleDownload}
        handleAddComment={handleAddComment}
        handleSeek={handleSeek}
        togglePlayPause={togglePlayPause}
        formatTime={formatTime}
        isRTL={isRTL}
        getLyricsContext={getLyricsContext}
        handleTimeUpdate={handleTimeUpdate}
        handlePlay={handlePlay}
        handlePause={handlePause}
        primaryFile={primaryFile}
    />
  )
} 