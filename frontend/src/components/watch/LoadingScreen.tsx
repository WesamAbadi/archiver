import React from 'react';
import { DynamicBackground } from '../DynamicBackground';

interface LoadingScreenProps {
  thumbnailUrl?: string;
  isMobile: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ thumbnailUrl, isMobile }) => {
  return (
    <div className="min-h-screen relative">
      <DynamicBackground 
        imageUrl={thumbnailUrl} 
        variant={isMobile ? 'mobile' : 'desktop'} 
      />
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-600/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-6"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Loading Content</h2>
          <p className="text-gray-400">Preparing your experience...</p>
        </div>
      </div>
    </div>
  );
}; 