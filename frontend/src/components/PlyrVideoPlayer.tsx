'use client'

import React, { useEffect, useRef, useState, Suspense, lazy } from 'react'

// React lazy import instead of Next.js dynamic for Vite compatibility
const PlyrComponent = lazy(() => import('./PlyrWrapper'))

interface PlyrVideoPlayerProps {
  src: string
  title: string
  poster?: string
  onTimeUpdate?: (currentTime: number) => void
  onPlay?: () => void
  onPause?: () => void
  onDurationChange?: (duration: number) => void
  className?: string
}

const LoadingFallback = ({ className }: { className?: string }) => (
  <div className={`w-full h-full flex items-center justify-center bg-black rounded-lg ${className || ''}`}>
    <div className="text-white">Loading video player...</div>
  </div>
)

export default function PlyrVideoPlayer({
  src,
  title,
  poster,
  onTimeUpdate,
  onPlay,
  onPause,
  onDurationChange,
  className = ''
}: PlyrVideoPlayerProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <LoadingFallback className={className} />
  }

  return (
    <Suspense fallback={<LoadingFallback className={className} />}>
      <PlyrComponent
        src={src}
        title={title}
        poster={poster}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onDurationChange={onDurationChange}
        className={className}
      />
    </Suspense>
  )
} 