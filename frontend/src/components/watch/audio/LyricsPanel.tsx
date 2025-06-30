import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { MediaPlayerRef } from '../../MediaPlayer';
import { Caption, CaptionSegment, LyricsContext } from './types';

interface LyricsPanelProps {
    captions: Caption[];
    showCaptions: boolean;
    lyricsContext: LyricsContext | null;
    isOwner: boolean;
    mediaData: any;
    getCaptionStatusIcon: (status: string) => React.ReactNode;
    getCaptionStatusText: (status: string) => string;
    isRTL: (text: string) => boolean;
    formatTime: (time: number) => string;
    mediaPlayerRef: React.RefObject<MediaPlayerRef>;
    currentTime: number;
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({
    captions,
    showCaptions,
    lyricsContext,
    isOwner,
    mediaData,
    getCaptionStatusIcon,
    getCaptionStatusText,
    isRTL,
    formatTime,
    mediaPlayerRef,
    currentTime
}) => {
    const [isScrollingSynced, setIsScrollingSynced] = useState(true);
    const [showSyncButton, setShowSyncButton] = useState(false);
    const lyricsContainerRef = useRef<HTMLDivElement>(null);
    const activeLyricRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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

    useEffect(() => {
        if (isScrollingSynced && activeLyricRef.current && lyricsContainerRef.current) {
          const container = lyricsContainerRef.current;
          const activeLyric = activeLyricRef.current;
          
          const containerHeight = container.clientHeight;
          const lyricTop = activeLyric.offsetTop;
          const lyricHeight = activeLyric.clientHeight;
          
          const scrollTop = lyricTop - (containerHeight / 2) + (lyricHeight / 2);
          
          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
    }, [currentTime, captions, isScrollingSynced]);

    return (
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
                    <div className="min-h-full flex flex-col justify-center py-12">
                        {lyricsContext && (
                            <>
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
    );
}; 