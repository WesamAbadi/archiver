import React from 'react';
import { ChevronRight, FileText, Info } from 'lucide-react';
import { LyricsPanel } from './LyricsPanel';
import { InfoPanel } from './InfoPanel';
import { MediaPlayerRef } from '../../MediaPlayer';
import { Caption, CaptionSegment, LyricsContext } from './types';

interface SidebarProps {
    activeTab: 'lyrics' | 'info';
    setActiveTab: (tab: 'lyrics' | 'info') => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    // LyricsPanel Props
    captions: Caption[];
    showCaptions: boolean;
    lyricsContext: LyricsContext | null;
    isOwner: boolean;
    getCaptionStatusIcon: (status: string) => React.ReactNode;
    getCaptionStatusText: (status: string) => string;
    isRTL: (text: string) => boolean;
    mediaPlayerRef: React.RefObject<MediaPlayerRef>;
    currentTime: number;
    // InfoPanel Props
    likeCount: number;
    comments: any[];
    duration: number;
    formatTime: (time: number) => string;
    mediaData: any;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
    const { 
        activeTab, setActiveTab, setSidebarCollapsed, ...rest 
    } = props;

    return (
        <div className="hidden lg:flex flex-col h-full">
            {/* Tab Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
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
                {activeTab === 'lyrics' && (
                    <LyricsPanel
                        captions={props.captions}
                        showCaptions={props.showCaptions}
                        lyricsContext={props.lyricsContext}
                        isOwner={props.isOwner}
                        mediaData={props.mediaData}
                        getCaptionStatusIcon={props.getCaptionStatusIcon}
                        getCaptionStatusText={props.getCaptionStatusText}
                        isRTL={props.isRTL}
                        formatTime={props.formatTime}
                        mediaPlayerRef={props.mediaPlayerRef}
                        currentTime={props.currentTime}
                    />
                )}
                {activeTab === 'info' && (
                   <div className="overflow-y-auto h-full custom-scrollbar pr-4">
                        <InfoPanel
                            mediaData={props.mediaData}
                            likeCount={props.likeCount}
                            comments={props.comments}
                            duration={props.duration}
                            formatTime={props.formatTime}
                        />
                   </div>
                )}
            </div>
        </div>
    );
}; 