import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { MediaPlayerRef } from "../../MediaPlayer";
import { Caption, CaptionSegment, LyricsContext } from "./types";

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
  currentTime,
}) => {
  const [isScrollingSynced, setIsScrollingSynced] = useState(true);
  const [showSyncButton, setShowSyncButton] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
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

  // Get all segments for rolling view
  const allSegments = captions.length > 0 ? captions[0].segments : [];
    const getCurrentSegmentIndex = () => {
    if (allSegments.length === 0) return -1;

    // First, check if we're currently within any segment
    for (let i = 0; i < allSegments.length; i++) {
        const segment = allSegments[i];
        if (currentTime >= segment.startTime && currentTime <= segment.endTime) {
        return i;
        }
    }

    // If we're not within any segment, find the last segment that has ended
    let lastEndedSegment = -1;
    for (let i = 0; i < allSegments.length; i++) {
        const segment = allSegments[i];
        if (currentTime > segment.endTime) {
        lastEndedSegment = i;
        } else {
        break; // We've reached segments that haven't started yet
        }
    }

    return lastEndedSegment;
    };

  const currentIndex = getCurrentSegmentIndex();

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
          ) : (
            "No lyrics available"
          )}
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

      {isOwner &&
      mediaData.data.data.captionStatus &&
      mediaData.data.data.captionStatus !== "COMPLETED" ? (
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
              {mediaData.data.data.captionStatus === "PENDING" &&
                "Captions will be generated automatically"}
              {mediaData.data.data.captionStatus === "QUEUED" &&
                "Your content is in the caption generation queue"}
              {mediaData.data.data.captionStatus === "PROCESSING" &&
                "AI is currently transcribing your content"}
              {mediaData.data.data.captionStatus === "FAILED" &&
                "Caption generation failed. Please try re-uploading the content."}
              {mediaData.data.data.captionStatus === "SKIPPED" &&
                "This content type does not support captions"}
            </p>
          </div>
        </div>
      ) : captions.length > 0 && showCaptions ? (
        <div
          ref={lyricsContainerRef}
          className="flex-1 overflow-hidden relative p-8"
          onScroll={handleLyricsScroll}
        >
          <div className="h-full flex flex-col justify-center items-center">
            {/* Rolling lyrics container */}
            <div className="relative h-96 w-full flex flex-col items-center justify-center">
              {allSegments.map((segment: CaptionSegment, index: number) => {
                // Calculate position relative to current segment
                const relativePosition = index - currentIndex;

                // Render more segments to avoid flashing (including ones that start off-screen)
                if (Math.abs(relativePosition) > 3) return null;

                // Calculate transform and opacity based on position
                let yOffset = relativePosition * 120; // Spacing between segments
                let opacity = 1;
                let scale = 1;
                let isActive = relativePosition === 0;

                // Pre-position segments that are coming from below
                if (relativePosition > 2) {
                  yOffset = 3 * 120; // Start them further down
                  opacity = 0;
                  scale = 0.9;
                } else if (relativePosition < -2) {
                  yOffset = -3 * 120; // Start them further up
                  opacity = 0;
                  scale = 0.9;
                } else if (relativePosition === 0) {
                  // Current segment - highlighted
                  opacity = 1;
                  scale = 1.05;
                } else if (Math.abs(relativePosition) === 1) {
                  // Adjacent segments - dimmed
                  opacity = 0.4;
                  scale = 0.95;
                } else {
                  // Distant segments - very dimmed
                  opacity = 0.2;
                  scale = 0.9;
                }

                return (
                  <motion.div
                    key={segment.id}
                    initial={{
                      y:
                        relativePosition > 0
                          ? 3 * 120
                          : relativePosition < 0
                          ? -3 * 120
                          : 0,
                      opacity: Math.abs(relativePosition) > 2 ? 0 : opacity,
                      scale: Math.abs(relativePosition) > 2 ? 0.9 : scale,
                    }}
                    animate={{
                      y: yOffset,
                      opacity,
                      scale,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                      mass: 0.8,
                    }}
                    className="absolute cursor-pointer w-full max-w-2xl"
                    onClick={() => {
                      if (mediaPlayerRef.current) {
                        mediaPlayerRef.current.seekTo(segment.startTime);
                      }
                    }}
                  >
                    <motion.div
                      animate={{
                        backgroundColor: isActive
                          ? "rgba(147, 51, 234, 0.1)"
                          : "transparent",
                        borderColor: isActive
                          ? "rgba(147, 51, 234, 0.2)"
                          : "transparent",
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut",
                      }}
                      className="p-6 rounded-xl border transition-all duration-300 hover:bg-gray-800/30"
                      style={{
                        boxShadow: isActive
                          ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
                          : "none",
                      }}
                    >
                      <div className="text-center">
                        <div
                          className={`text-sm mb-3 transition-colors duration-300 ${
                            isActive ? "text-purple-300" : "text-purple-300/60"
                          }`}
                        >
                          {formatTime(segment.startTime)} -{" "}
                          {formatTime(segment.endTime)}
                        </div>
                        <p
                          className={`text-2xl leading-relaxed font-medium transition-all duration-300 ${
                            isActive
                              ? "bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
                              : "text-gray-300 hover:text-white"
                          }`}
                          style={{
                            direction: isRTL(segment.text) ? "rtl" : "ltr",
                            fontFamily: isRTL(segment.text)
                              ? 'Arial, "Noto Sans Arabic", sans-serif'
                              : "inherit",
                          }}
                        >
                          {segment.text}
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-6xl mb-4 opacity-20">🎤</div>
            <p className="text-gray-400 text-lg">
              {captions.length === 0 ? "No lyrics available" : "Lyrics hidden"}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {captions.length === 0
                ? "Lyrics will appear here when available"
                : 'Click "Show Lyrics" to display them'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
