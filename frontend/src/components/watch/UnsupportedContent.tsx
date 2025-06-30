import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DynamicBackground } from '../DynamicBackground';

interface UnsupportedContentProps {
  thumbnailUrl?: string;
  isMobile: boolean;
}

export const UnsupportedContent: React.FC<UnsupportedContentProps> = ({ thumbnailUrl, isMobile }) => {
  return (
    <div className="min-h-screen relative">
      <DynamicBackground 
        imageUrl={thumbnailUrl} 
        variant={isMobile ? 'mobile' : 'desktop'} 
      />
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">📁</div>
          <h1 className="text-2xl font-bold text-white mb-2">Unsupported Content</h1>
          <p className="text-gray-400 mb-6">This content type is not supported for playback.</p>
          <Link to="/" className="px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors inline-flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Link>
        </div>
      </div>
    </div>
  );
}; 