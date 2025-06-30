import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { CommentSection } from '../common';
import { DynamicBackground } from '../DynamicBackground';
import ErrorBoundary from '../ErrorBoundary';
import MediaPlayer from '../MediaPlayer';
import { AudioViewHeader } from './audio/AudioViewHeader';
import { TrackInformation } from './audio/TrackInformation';
import { AudioPlayerControls } from './audio/AudioPlayerControls';
import { Sidebar } from './audio/Sidebar';
import { MobileModals } from './audio/MobileModals';

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

    const [showAllLyricsModal, setShowAllLyricsModal] = useState(false)
    const [showMobileInfo, setShowMobileInfo] = useState(false)
    const [activeTab, setActiveTab] = useState<'lyrics' | 'info'>('lyrics')
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    const lyricsContext = getLyricsContext();
    const currentCaption = lyricsContext?.current;
    const showingCaptions = captions.length > 0 && showCaptions;

    return (
        <div className="min-h-screen relative">
        <DynamicBackground 
          imageUrl={thumbnailUrl} 
          variant={isMobile ? 'mobile' : 'desktop'} 
        />
        
        <AudioViewHeader />
  
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
                <TrackInformation
                  mediaData={mediaData}
                  liked={liked}
                  likeCount={likeCount}
                  captions={captions}
                  showingCaptions={showingCaptions}
                  currentCaption={currentCaption}
                  isPlaying={isPlaying}
                  isRTL={isRTL}
                  formatTime={formatTime}
                  togglePlayPause={togglePlayPause}
                  handleLike={handleLike}
                  handleShare={handleShare}
                  handleDownload={handleDownload}
                  setShowAllLyricsModal={setShowAllLyricsModal}
                  setShowMobileInfo={setShowMobileInfo}
                />
                
                <AudioPlayerControls
                  duration={duration}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  mediaPlayerRef={mediaPlayerRef}
                  handleSeek={handleSeek}
                  togglePlayPause={togglePlayPause}
                  formatTime={formatTime}
                />
              </div>
  
              {/* Right Side - Lyrics/Info with Tabs */}
              {!sidebarCollapsed && (
                <Sidebar
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  setSidebarCollapsed={setSidebarCollapsed}
                  captions={captions}
                  showCaptions={showCaptions}
                  lyricsContext={lyricsContext}
                  isOwner={isOwner}
                  getCaptionStatusIcon={getCaptionStatusIcon}
                  getCaptionStatusText={getCaptionStatusText}
                  isRTL={isRTL}
                  mediaPlayerRef={mediaPlayerRef}
                  currentTime={currentTime}
                  likeCount={likeCount}
                  comments={comments}
                  duration={duration}
                  formatTime={formatTime}
                  mediaData={mediaData}
                />
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
              <CommentSection
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
  
        <MobileModals
          showMobileInfo={showMobileInfo}
          setShowMobileInfo={setShowMobileInfo}
          showAllLyricsModal={showAllLyricsModal}
          setShowAllLyricsModal={setShowAllLyricsModal}
          mediaData={mediaData}
          likeCount={likeCount}
          comments={comments}
          duration={duration}
          formatTime={formatTime}
          captions={captions}
          currentTime={currentTime}
          isRTL={isRTL}
          mediaPlayerRef={mediaPlayerRef}
        />
  
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