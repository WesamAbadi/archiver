import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface InfoPanelProps {
    mediaData: any;
    likeCount: number;
    comments: any[];
    duration: number;
    formatTime: (time: number) => string;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
    mediaData,
    likeCount,
    comments,
    duration,
    formatTime,
}) => {
    const [showFullDescription, setShowFullDescription] = useState(false);

    return (
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
    );
}; 