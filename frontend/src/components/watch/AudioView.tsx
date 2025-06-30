import React, { useState, useRef, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Heart,
  Info,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, EnhancedCommentSection } from '../common';
import { DynamicBackground } from '../DynamicBackground';
import Modal from '../modals/Modal';
import ErrorBoundary from '../ErrorBoundary';
import MediaPlayer, { MediaPlayerRef } from '../MediaPlayer';

// TODO: Share these types
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

interface LyricsContext {
    previous: CaptionSegment | null;
    current: CaptionSegment | null;
    next: CaptionSegment | null;
    activeIndex: number;
    currentIndex: number;
}

export const AudioView = (props: any) => {
    const {
        mediaData,
        thumbnailUrl,
        isMobile,
        captions,
        currentTime,
        duration,
        isPlaying,
        liked,
        likeCount,
        showCaptions,
        comments,
        user,
        commentsLoading,
        isOwner,
        mediaPlayerRef,
        handleLike,
        handleShare,
        handleDownload,
        handleAddComment,
        handleSeek,
        togglePlayPause,
        formatTime,
        isRTL,
        getLyricsContext,
        getCaptionStatusIcon,
        getCaptionStatusText,
        handleTimeUpdate,
        handlePlay,
        handlePause,
        primaryFile,
    } = props;

    const [showFullDescription, setShowFullDescription] = useState(false)
    const [showMobileLyrics, setShowMobileLyrics] = useState(true)
    const [showAllLyricsModal, setShowAllLyricsModal] = useState(false)
    const [showMobileControls, setShowMobileControls] = useState(false)
    const [showMobileInfo, setShowMobileInfo] = useState(false)
    const [activeTab, setActiveTab] = useState<'lyrics' | 'info'>('lyrics')
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [isScrollingSynced, setIsScrollingSynced] = useState(true)
    const [showSyncButton, setShowSyncButton] = useState(false)
    const lyricsContainerRef = useRef<HTMLDivElement>(null)
    const activeLyricRef = useRef<HTMLDivElement>(null)
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

    const lyricsContext = getLyricsContext();
    const currentCaption = lyricsContext?.current;
    const showingCaptions = captions.length > 0 && showCaptions;

    const handleLyricsScroll = () => {
        if (!isScrollingSynced) return;
        
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        setIsScrollingSynced(false);
        setShowSyncButton(true);
        
        scrollTimeoutRef.current = setTimeout(() => {
          setIsScrollingSynced(true);
          setShowSyncButton(false);
        }, 3000);
      };
    
      const syncToCurrentLyric = () => {
        setIsScrollingSynced(true);
        setShowSyncButton(false);
      };

    React.useEffect(() => {
        if (isScrollingSynced && activeLyricRef.current && lyricsContainerRef.current) {
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
    }, [currentTime, captions, isScrollingSynced])

    return (
        <div className="min-h-screen relative">
        <DynamicBackground 
          imageUrl={thumbnailUrl} 
          variant={isMobile ? 'mobile' : 'desktop'} 
        />
        
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
            <div className={`grid gap-12 transition-all duration-500 ${
              sidebarCollapsed 
                ? 'grid-cols-1' 
                : 'grid-cols-1 lg:grid-cols-2'
            }`}>
              {/* Left Side - Album Art & Controls */}
              <div className={`flex flex-col items-center space-y-8 ${
                sidebarCollapsed ? 'max-w-2xl mx-auto' : ''
              } transition-all duration-500`}>
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
                    
                    {/* Mobile Lyrics Overlay */}
                    <div className={`lg:hidden absolute inset-0 bg-black/70 backdrop-blur-sm transition-all duration-300 rounded-3xl ${
                      showMobileLyrics && showingCaptions ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>
                      <div className="absolute inset-0 flex flex-col justify-center items-center p-6">
                        <div className="text-center max-w-full">
                          <AnimatePresence mode="wait">
                            {currentCaption && (
                              <motion.div
                                key={currentCaption.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                              >
                                <div className="text-xs text-purple-300 mb-3 opacity-80">
                                  {formatTime(currentCaption.startTime)} - {formatTime(currentCaption.endTime)}
                                </div>
                                <p 
                                  className={`text-xl md:text-2xl leading-relaxed text-white font-medium bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent ${
                                    isRTL(currentCaption.text) ? 'font-arabic text-right' : 'text-center'
                                  }`}
                                  style={{ 
                                    direction: isRTL(currentCaption.text) ? 'rtl' : 'ltr',
                                    fontFamily: isRTL(currentCaption.text) ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                                  }}
                                >
                                  {currentCaption.text}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                    
                    {/* Mobile Controls Overlay - Click to show, click again to hide */}
                    <div 
                      className={`lg:hidden absolute inset-0 transition-all duration-300 ${
                        showMobileControls ? 'bg-black/40 opacity-100' : 'opacity-0'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!showMobileControls) {
                          setShowMobileControls(true);
                        }
                      }}
                    >
                      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                        showMobileControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}>
                        <div className="flex flex-col items-center space-y-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePlayPause();
                            }}
                            className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                          >
                            {isPlaying ? (
                              <Pause className="w-8 h-8 text-black" />
                            ) : (
                              <Play className="w-8 h-8 text-black ml-1" />
                            )}
                          </button>
                          
                          <div className="flex items-center space-x-4">
                            {/* Toggle Lyrics Button */}
                            {captions.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowMobileLyrics(!showMobileLyrics);
                                }}
                                className="px-3 py-2 bg-purple-600/80 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-purple-700/80 transition-all flex items-center space-x-1.5"
                              >
                                <FileText className="w-3 h-3" />
                                <span>{showMobileLyrics ? 'Hide' : 'Show'}</span>
                              </button>
                            )}
                            
                            {/* View All Lyrics Button */}
                            {captions.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowAllLyricsModal(true);
                                }}
                                className="px-3 py-2 bg-gray-700/80 backdrop-blur-sm text-gray-300 rounded-full text-xs font-medium hover:bg-gray-600/80 transition-all flex items-center space-x-1.5"
                              >
                                <FileText className="w-3 h-3" />
                                <span>All</span>
                              </button>
                            )}
                            
                            {/* Info Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowMobileInfo(true);
                              }}
                              className="px-3 py-2 bg-gray-700/80 backdrop-blur-sm text-gray-300 rounded-full text-xs font-medium hover:bg-gray-600/80 transition-all flex items-center space-x-1.5"
                            >
                              <Info className="w-3 h-3" />
                              <span>Info</span>
                            </button>
                          </div>
                          
                          {/* Close Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMobileControls(false);
                            }}
                            className="mt-3 w-8 h-8 bg-gray-800/80 backdrop-blur-sm text-gray-300 rounded-full flex items-center justify-center hover:bg-gray-700/80 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Desktop Play/Pause Overlay */}
                    <div className="hidden lg:block absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 flex items-center justify-center">
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
                      // toast.success('Shuffle mode toggled');
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
                      // toast.success('Repeat mode toggled');
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
  
              {/* Right Side - Lyrics/Info with Tabs */}
              {!sidebarCollapsed && (
                <div className="hidden lg:flex flex-col h-full">
                  {/* Tab Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                      {/* Tabs */}
                      <div className="flex bg-gray-800/50 rounded-full p-1">
                        <button
                          onClick={() => setActiveTab('lyrics')}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            activeTab === 'lyrics'
                              ? 'bg-purple-600 text-white shadow-lg'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4" />
                            <span>Lyrics</span>
                          </div>
                        </button>
                        <button
                          onClick={() => setActiveTab('info')}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            activeTab === 'info'
                              ? 'bg-purple-600 text-white shadow-lg'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Info className="w-4 h-4" />
                            <span>Info</span>
                          </div>
                        </button>
                      </div>
                    </div>
  
                    {/* Collapse Button */}
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-800/50"
                      title="Hide sidebar"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
  
                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden">
                    {/* Lyrics Tab */}
                    {activeTab === 'lyrics' && (
                      <div className="h-full flex flex-col">
                        <div className="mb-4">
                          <p className="text-gray-400 text-sm">
                            {captions.length > 0 ? (
                              <>
                                {captions[0].segments.length} segments • Auto-generated
                                {captions[0].segments.some((s: any) => isRTL(s.text)) && (
                                  <span className="ml-2 px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                                    Arabic/RTL
                                  </span>
                                )}
                              </>
                            ) : 'No lyrics available'}
                          </p>
                          
                          {/* Sync Button */}
                          <AnimatePresence>
                            {showSyncButton && (
                              <motion.button
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                onClick={syncToCurrentLyric}
                                className="mt-3 px-3 py-1 bg-purple-600/20 text-purple-300 border border-purple-600/30 rounded-full text-sm transition-all hover:bg-purple-600/30 flex items-center space-x-2"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Sync to current</span>
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
  
                        {/* Lyrics Content */}
                        {isOwner && mediaData.data.data.captionStatus && mediaData.data.data.captionStatus !== 'COMPLETED' ? (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="text-center max-w-md">
                              <div className="flex items-center justify-center space-x-3 mb-4">
                                {getCaptionStatusIcon(mediaData.data.data.captionStatus)}
                                <span className="text-lg text-gray-300">
                                  {getCaptionStatusText(mediaData.data.data.captionStatus)}
                                </span>
                              </div>
                              
                              {mediaData.data.data.captionErrorMessage && (
                                <p className="text-sm text-red-400 mb-4">
                                  {mediaData.data.data.captionErrorMessage}
                                </p>
                              )}
                              
                              <p className="text-gray-500 text-sm">
                                {mediaData.data.data.captionStatus === 'PENDING' && 'Captions will be generated automatically'}
                                {mediaData.data.data.captionStatus === 'QUEUED' && 'Your content is in the caption generation queue'}
                                {mediaData.data.data.captionStatus === 'PROCESSING' && 'AI is currently transcribing your content'}
                                {mediaData.data.data.captionStatus === 'FAILED' && 'Caption generation failed. Please try re-uploading the content.'}
                                {mediaData.data.data.captionStatus === 'SKIPPED' && 'This content type does not support captions'}
                              </p>
                            </div>
                          </div>
                        ) : captions.length > 0 && showCaptions ? (
                          <div 
                            ref={lyricsContainerRef}
                            className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar"
                            onScroll={handleLyricsScroll}
                          >
                            {/* Center-focused lyrics display */}
                            <div className="min-h-full flex flex-col justify-center py-12">
                              {lyricsContext && (
                                <>
                                  {/* Previous segment */}
                                  {lyricsContext.previous && (
                                    <motion.div 
                                      key={`prev-${lyricsContext.previous.id}`}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 0.4, y: 0 }}
                                      exit={{ opacity: 0, y: -20 }}
                                      transition={{ duration: 0.4, ease: "easeInOut" }}
                                      className="cursor-pointer transition-all duration-300 p-4 rounded-lg hover:opacity-60"
                                      onClick={() => {
                                        if (mediaPlayerRef.current) {
                                          mediaPlayerRef.current.seekTo(lyricsContext.previous!.startTime);
                                        }
                                      }}
                                    >
                                      <div className="text-center">
                                        <div className="text-xs text-purple-300 mb-2 opacity-60">
                                          {formatTime(lyricsContext.previous.startTime)} - {formatTime(lyricsContext.previous.endTime)}
                                        </div>
                                        <p className="text-lg text-gray-400" 
                                          style={{ 
                                            direction: isRTL(lyricsContext.previous.text) ? 'rtl' : 'ltr',
                                            fontFamily: isRTL(lyricsContext.previous.text) ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                                          }}>
                                          {lyricsContext.previous.text}
                                        </p>
                                      </div>
                                    </motion.div>
                                  )}
  
                                  {/* Current segment */}
                                  {lyricsContext.current && (
                                    <motion.div
                                      key={`current-${lyricsContext.current.id}`}
                                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                      animate={{ 
                                        opacity: 1, 
                                        scale: lyricsContext.activeIndex === lyricsContext.currentIndex ? 1.05 : 1, 
                                        y: 0 
                                      }}
                                      exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                      transition={{ duration: 0.5, ease: "easeInOut" }}
                                      ref={lyricsContext.activeIndex === lyricsContext.currentIndex ? activeLyricRef : null}
                                      className={`cursor-pointer transition-all duration-500 p-6 rounded-xl ${
                                        lyricsContext.activeIndex === lyricsContext.currentIndex 
                                          ? 'bg-purple-600/10 shadow-xl border border-purple-500/20' 
                                          : 'hover:bg-gray-800/30'
                                      }`}
                                      onClick={() => {
                                        if (mediaPlayerRef.current) {
                                          mediaPlayerRef.current.seekTo(lyricsContext.current!.startTime);
                                        }
                                      }}
                                    >
                                      <div className="text-center">
                                        <div className="text-sm text-purple-300 mb-3 opacity-80">
                                          {formatTime(lyricsContext.current.startTime)} - {formatTime(lyricsContext.current.endTime)}
                                        </div>
                                        <p className={`text-2xl leading-relaxed transition-all duration-500 font-medium ${
                                          lyricsContext.activeIndex === lyricsContext.currentIndex
                                            ? 'text-white bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent'
                                            : 'text-gray-300 hover:text-white'
                                        }`}
                                        style={{ 
                                          direction: isRTL(lyricsContext.current.text) ? 'rtl' : 'ltr',
                                          fontFamily: isRTL(lyricsContext.current.text) ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                                        }}>
                                          {lyricsContext.current.text}
                                        </p>
                                      </div>
                                    </motion.div>
                                  )}
  
                                  {/* Next segment */}
                                  {lyricsContext.next && (
                                    <motion.div 
                                      key={`next-${lyricsContext.next.id}`}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 0.4, y: 0 }}
                                      exit={{ opacity: 0, y: -20 }}
                                      transition={{ duration: 0.4, ease: "easeInOut" }}
                                      className="cursor-pointer transition-all duration-300 p-4 rounded-lg hover:opacity-60"
                                      onClick={() => {
                                        if (mediaPlayerRef.current) {
                                          mediaPlayerRef.current.seekTo(lyricsContext.next!.startTime);
                                        }
                                      }}
                                    >
                                      <div className="text-center">
                                        <div className="text-xs text-purple-300 mb-2 opacity-60">
                                          {formatTime(lyricsContext.next.startTime)} - {formatTime(lyricsContext.next.endTime)}
                                        </div>
                                        <p className="text-lg text-gray-400"
                                          style={{ 
                                            direction: isRTL(lyricsContext.next.text) ? 'rtl' : 'ltr',
                                            fontFamily: isRTL(lyricsContext.next.text) ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                                          }}>
                                          {lyricsContext.next.text}
                                        </p>
                                      </div>
                                    </motion.div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-center">
                            <div>
                              <div className="text-6xl mb-4 opacity-20">🎤</div>
                              <p className="text-gray-400 text-lg">
                                {captions.length === 0 ? 'No lyrics available' : 'Lyrics hidden'}
                              </p>
                              <p className="text-gray-500 text-sm mt-2">
                                {captions.length === 0 ? 'Lyrics will appear here when available' : 'Click "Show Lyrics" to display them'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
  
                    {/* Info Tab */}
                    {activeTab === 'info' && (
                      <div className="space-y-6">
                        {/* Creator Info */}
                        <div className="bg-gray-800/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Creator</h3>
                          <div className="flex items-center space-x-4">
                            <img
                              src={mediaData.data.data.user?.photoURL || "/default-avatar.png"}
                              alt={mediaData.data.data.user?.displayName || "Creator"}
                              className="w-12 h-12 rounded-full border-2 border-purple-600/50"
                            />
                            <div>
                              <h4 className="font-semibold text-white">
                                {mediaData.data.data.user?.displayName || "Unknown Creator"}
                              </h4>
                              <p className="text-gray-400 text-sm">Content Creator</p>
                              {mediaData.data.data.originalAuthor && mediaData.data.data.originalAuthor !== mediaData.data.data.user?.displayName && (
                                <p className="text-purple-300 text-xs mt-1">
                                  Original: {mediaData.data.data.originalAuthor}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
  
                        {/* Statistics */}
                        <div className="bg-gray-800/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Statistics</h3>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Views</span>
                              <span className="text-white">{mediaData.data.data.viewCount || 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Likes</span>
                              <span className="text-white">{likeCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Comments</span>
                              <span className="text-white">{comments.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Duration</span>
                              <span className="text-white">{formatTime(duration)}</span>
                            </div>
                            {mediaData.data.data.size && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">File Size</span>
                                <span className="text-white">
                                  {(parseInt(mediaData.data.data.size) / (1024 * 1024)).toFixed(1)} MB
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
  
                        {/* Source & Format */}
                        <div className="bg-gray-800/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Source & Format</h3>
                          <div className="space-y-3">
                            {mediaData.data.data.platform && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Platform</span>
                                <span className="text-white capitalize">
                                  {mediaData.data.data.platform.toLowerCase().replace('_', ' ')}
                                </span>
                              </div>
                            )}
                            {mediaData.data.data.format && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Format</span>
                                <span className="text-white uppercase">{mediaData.data.data.format}</span>
                              </div>
                            )}
                            {mediaData.data.data.files?.[0]?.mimeType && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Type</span>
                                <span className="text-white">{mediaData.data.data.files[0].mimeType}</span>
                              </div>
                            )}
                            {mediaData.data.data.originalUrl && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-400">Original Source</span>
                                <a 
                                  href={mediaData.data.data.originalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 flex items-center space-x-1 transition-colors"
                                >
                                  <span className="text-sm">View</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
  
                        {/* Dates */}
                        <div className="bg-gray-800/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Timeline</h3>
                          <div className="space-y-3">
                            {mediaData.data.data.publishedAt && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Originally Published</span>
                                <span className="text-white text-sm">
                                  {new Date(mediaData.data.data.publishedAt).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-gray-400">Archived</span>
                              <span className="text-white text-sm">
                                {new Date(mediaData.data.data.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {mediaData.data.data.captionGeneratedAt && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Captions Generated</span>
                                <span className="text-white text-sm">
                                  {new Date(mediaData.data.data.captionGeneratedAt).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
  
                        {/* AI Information */}
                        {(mediaData.data.data.aiKeywords?.length > 0 || mediaData.data.data.aiSummary) && (
                          <div className="bg-gray-800/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4">AI Analysis</h3>
                            {mediaData.data.data.aiKeywords?.length > 0 && (
                              <div className="mb-4">
                                <span className="text-gray-400 text-sm block mb-2">Keywords</span>
                                <div className="flex flex-wrap gap-2">
                                  {mediaData.data.data.aiKeywords.map((keyword: string, index: number) => (
                                    <span 
                                      key={index}
                                      className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded-full text-xs"
                                    >
                                      {keyword}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {mediaData.data.data.aiSummary && mediaData.data.data.aiSummary !== "AI-generated summary will be available soon" && (
                              <div>
                                <span className="text-gray-400 text-sm block mb-2">Summary</span>
                                <p className="text-gray-300 text-sm leading-relaxed">
                                  {mediaData.data.data.aiSummary}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
  
                        {/* Description */}
                        {mediaData.data.data.description && (
                          <div className="bg-gray-800/30 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-lg font-semibold">Description</h3>
                              {mediaData.data.data.description.length > 200 && (
                                <button
                                  onClick={() => setShowFullDescription(!showFullDescription)}
                                  className="text-purple-400 hover:text-purple-300 text-sm px-3 py-1 rounded-full bg-purple-600/20 hover:bg-purple-600/30 transition-all"
                                >
                                  {showFullDescription ? "Show less" : "Show more"}
                                </button>
                              )}
                            </div>
                            <p className="text-gray-300 leading-relaxed">
                              {showFullDescription
                                ? mediaData.data.data.description
                                : mediaData.data.data.description.slice(0, 200) +
                                  (mediaData.data.data.description.length > 200 ? "..." : "")}
                            </p>
                          </div>
                        )}
  
                        {/* Tags */}
                        {mediaData.data.data.hashtags?.length > 0 && (
                          <div className="bg-gray-800/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4">Tags</h3>
                            <div className="flex flex-wrap gap-2">
                              {mediaData.data.data.hashtags.map((tag: string, index: number) => (
                                <span 
                                  key={index}
                                  className="px-3 py-1 bg-gray-700/50 text-gray-300 rounded-full text-sm flex items-center space-x-1"
                                >
                                  <span>#</span>
                                  <span>{tag}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
  
              {/* Expand Sidebar Button */}
              {sidebarCollapsed && (
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => setSidebarCollapsed(false)}
                  className="hidden lg:flex fixed right-6 top-1/2 transform -translate-y-1/2 bg-gray-800/80 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-gray-700/80 transition-all p-3 rounded-full shadow-xl"
                  title="Show sidebar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
              )}
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
  
        {/* Mobile Info Modal */}
        <Modal
          isOpen={showMobileInfo}
          onClose={() => setShowMobileInfo(false)}
          title="Track Info"
          maxWidth="md"
        >
          <div className="p-6 space-y-6">
            {/* Creator Info */}
            <div className="flex items-center space-x-4">
              <img
                src={mediaData.data.data.user?.photoURL || "/default-avatar.png"}
                alt={mediaData.data.data.user?.displayName || "Creator"}
                className="w-12 h-12 rounded-full border-2 border-purple-600/50"
              />
              <div>
                <h4 className="font-semibold text-white">
                  {mediaData.data.data.user?.displayName || "Unknown Creator"}
                </h4>
                <p className="text-gray-400 text-sm">Content Creator</p>
              </div>
            </div>
  
            {/* Stats */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Views</span>
                <span className="text-white">{mediaData.data.data.viewCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Likes</span>
                <span className="text-white">{likeCount}</span>
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
  
            {/* Description */}
            {mediaData.data.data.description && (
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-gray-300 leading-relaxed text-sm">
                  {mediaData.data.data.description}
                </p>
              </div>
            )}
          </div>
        </Modal>
  
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
  
        {/* All Lyrics Modal */}
        <Modal
          isOpen={showAllLyricsModal}
          onClose={() => setShowAllLyricsModal(false)}
          title="All Lyrics"
          maxWidth="md"
        >
          <div className="p-6 space-y-6">
            {captions[0]?.segments.map((segment: any, index: number) => {
              const isActive = currentTime >= segment.startTime && currentTime <= segment.endTime;
              const isSegmentRTL = isRTL(segment.text);
              
              return (
                <div
                  key={segment.id}
                  className={`transition-all duration-300 ${
                    isActive ? 'transform scale-105 bg-purple-600/10 p-4 rounded-lg' : ''
                  }`}
                  onClick={() => {
                    if (mediaPlayerRef.current) {
                      mediaPlayerRef.current.seekTo(segment.startTime);
                      setShowAllLyricsModal(false);
                    }
                  }}
                >
                  <div className="text-xs text-purple-300 mb-1 opacity-80">
                    {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                  </div>
                  <p 
                    className={`text-lg leading-relaxed transition-all duration-300 ${
                      isActive 
                        ? 'text-white font-medium bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' 
                        : 'text-gray-300'
                    } ${isSegmentRTL ? 'font-arabic text-right' : ''}`}
                    style={{ 
                      direction: isSegmentRTL ? 'rtl' : 'ltr',
                      fontFamily: isSegmentRTL ? 'Arial, "Noto Sans Arabic", sans-serif' : 'inherit'
                    }}
                  >
                    {segment.text}
                  </p>
                </div>
              );
            })}
          </div>
        </Modal>
  
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
  
          /* Fade in animation for mobile lyrics overlay */
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
  
          .animate-fadeIn {
            animation: fadeIn 0.3s ease-out;
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
  
          /* Mobile responsive adjustments */
          @media (max-width: 1024px) {
            .album-art-overlay {
              padding: 1rem;
            }
            
            .album-art-overlay p {
              font-size: 1rem;
              line-height: 1.6;
            }
          }
  
          @media (max-width: 640px) {
            .album-art-overlay p {
              font-size: 0.9rem;
              line-height: 1.5;
            }
          }
  
          /* Ensure smooth scrolling for lyrics container */
          .scroll-smooth {
            scroll-behavior: smooth;
          }
  
          /* Center the active lyric in the container */
          .custom-scrollbar {
            scroll-padding: 50vh;
          }
        `}</style>
      </div>
    )
} 