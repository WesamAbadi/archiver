import React from 'react';
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { MediaPlayerRef } from '../../MediaPlayer';

interface AudioPlayerControlsProps {
    duration: number;
    currentTime: number;
    isPlaying: boolean;
    mediaPlayerRef: React.RefObject<MediaPlayerRef>;
    handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
    togglePlayPause: () => void;
    formatTime: (time: number) => string;
}

export const AudioPlayerControls: React.FC<AudioPlayerControlsProps> = ({
    duration,
    currentTime,
    isPlaying,
    mediaPlayerRef,
    handleSeek,
    togglePlayPause,
    formatTime,
}) => {
    return (
        <>
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
        </>
    );
}; 