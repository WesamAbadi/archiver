import React from 'react';
import Modal from '../../modals/Modal';
import { MediaPlayerRef } from '../../MediaPlayer';
import { Caption, CaptionSegment } from './types';

interface MobileModalsProps {
    showMobileInfo: boolean;
    setShowMobileInfo: (show: boolean) => void;
    showAllLyricsModal: boolean;
    setShowAllLyricsModal: (show: boolean) => void;
    mediaData: any;
    likeCount: number;
    comments: any[];
    duration: number;
    formatTime: (time: number) => string;
    captions: Caption[];
    currentTime: number;
    isRTL: (text: string) => boolean;
    mediaPlayerRef: React.RefObject<MediaPlayerRef>;
}

export const MobileModals: React.FC<MobileModalsProps> = ({
    showMobileInfo,
    setShowMobileInfo,
    showAllLyricsModal,
    setShowAllLyricsModal,
    mediaData,
    likeCount,
    comments,
    duration,
    formatTime,
    captions,
    currentTime,
    isRTL,
    mediaPlayerRef,
}) => {
    return (
        <>
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

            {/* All Lyrics Modal */}
            <Modal
                isOpen={showAllLyricsModal}
                onClose={() => setShowAllLyricsModal(false)}
                title="All Lyrics"
                maxWidth="md"
            >
                <div className="p-6 space-y-6">
                    {captions[0]?.segments.map((segment: any) => {
                        const isActive = currentTime >= segment.startTime && currentTime <= segment.endTime;
                        const isSegmentRTL = isRTL(segment.text);

                        return (
                            <div
                                key={segment.id}
                                className={`transition-all duration-300 cursor-pointer ${
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
        </>
    );
}; 