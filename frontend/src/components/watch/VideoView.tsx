import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Eye,
  Heart,
  MessageCircle,
  Share2
} from 'lucide-react';
import { Card, CommentSection } from '../common';
import { DynamicBackground } from '../DynamicBackground';
import PlyrVideoPlayer from '../PlyrVideoPlayer';

// TODO: These types should be shared
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
}

interface VideoViewProps {
  mediaData: any;
  primaryFile: any;
  thumbnailUrl?: string;
  isMobile: boolean;
  liked: boolean;
  likeCount: number;
  comments: any[];
  duration: number;
  setDuration: (duration: number) => void;
  handleTimeUpdate: (e: any) => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleLike: () => void;
  handleShare: () => void;
  handleDownload: () => void;
  handleAddComment: (content: string) => Promise<void>;
  user: any;
  commentsLoading: boolean;
  formatTime: (time: number) => string;
}

export const VideoView: React.FC<VideoViewProps> = ({
  mediaData,
  primaryFile,
  thumbnailUrl,
  isMobile,
  liked,
  likeCount,
  comments,
  duration,
  setDuration,
  handleTimeUpdate,
  handlePlay,
  handlePause,
  handleLike,
  handleShare,
  handleDownload,
  handleAddComment,
  user,
  commentsLoading,
  formatTime,
}) => {
  const [showFullDescription, setShowFullDescription] = useState(false);

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
                <CommentSection
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
    </div>
  );
}; 