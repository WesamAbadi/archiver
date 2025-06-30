import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, Heart, Info, MoreHorizontal, Pause, Play, Share2, X } from 'lucide-react';
import { CaptionSegment } from './types';

interface TrackInformationProps {
    mediaData: any;
    liked: boolean;
    likeCount: number;
    captions: any[];
    showingCaptions: boolean;
    currentCaption: CaptionSegment | null;
    isPlaying: boolean;
    isRTL: (text: string) => boolean;
    formatTime: (time: number) => string;
    togglePlayPause: () => void;
    handleLike: () => void;
    handleShare: () => void;
    handleDownload: () => void;
    setShowAllLyricsModal: (show: boolean) => void;
    setShowMobileInfo: (show: boolean) => void;
}

export const TrackInformation: React.FC<TrackInformationProps> = ({
    mediaData,
    liked,
    likeCount,
    captions,
    showingCaptions,
    currentCaption,
    isPlaying,
    isRTL,
    formatTime,
    togglePlayPause,
    handleLike,
    handleShare,
    handleDownload,
    setShowAllLyricsModal,
    setShowMobileInfo,
}) => {
    const [showMobileLyrics, setShowMobileLyrics] = useState(true);
    const [showMobileControls, setShowMobileControls] = useState(false);

    return (
        <div className="flex flex-col items-center space-y-8 transition-all duration-500 w-full">
            {/* Album Art */}
            <div className="relative group w-80 h-80 md:w-96 md:h-96">
                <div className="w-full h-full rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 shadow-2xl overflow-hidden">
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

                    {/* Mobile Controls Overlay */}
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
                                    {isPlaying ? <Pause className="w-8 h-8 text-black" /> : <Play className="w-8 h-8 text-black ml-1" />}
                                </button>

                                <div className="flex items-center space-x-4">
                                    {captions.length > 0 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowMobileLyrics(!showMobileLyrics); }}
                                            className="px-3 py-2 bg-purple-600/80 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-purple-700/80 transition-all flex items-center space-x-1.5"
                                        >
                                            <FileText className="w-3 h-3" />
                                            <span>{showMobileLyrics ? 'Hide' : 'Show'}</span>
                                        </button>
                                    )}
                                    {captions.length > 0 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowAllLyricsModal(true); }}
                                            className="px-3 py-2 bg-gray-700/80 backdrop-blur-sm text-gray-300 rounded-full text-xs font-medium hover:bg-gray-600/80 transition-all flex items-center space-x-1.5"
                                        >
                                            <FileText className="w-3 h-3" />
                                            <span>All</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowMobileInfo(true); }}
                                        className="px-3 py-2 bg-gray-700/80 backdrop-blur-sm text-gray-300 rounded-full text-xs font-medium hover:bg-gray-600/80 transition-all flex items-center space-x-1.5"
                                    >
                                        <Info className="w-3 h-3" />
                                        <span>Info</span>
                                    </button>
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowMobileControls(false); }}
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
    );
}; 