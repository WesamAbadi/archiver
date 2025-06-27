'use client'

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

interface PlyrWrapperProps {
  src: string
  title: string
  poster?: string
  onTimeUpdate?: (currentTime: number) => void
  onPlay?: () => void
  onPause?: () => void
  onDurationChange?: (duration: number) => void
  className?: string
}

export interface PlyrWrapperRef {
  play: () => void
  pause: () => void
  seekTo: (time: number) => void
  currentTime: number
  duration: number
}

const PlyrWrapper = forwardRef<PlyrWrapperRef, PlyrWrapperProps>(({
  src,
  title,
  poster,
  onTimeUpdate,
  onPlay,
  onPause,
  onDurationChange,
  className = ''
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const plyrRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    play: () => plyrRef.current?.play(),
    pause: () => plyrRef.current?.pause(),
    seekTo: (time: number) => {
      if (plyrRef.current) {
        plyrRef.current.currentTime = time
      }
    },
    get currentTime() {
      return plyrRef.current?.currentTime || 0
    },
    get duration() {
      return plyrRef.current?.duration || 0
    }
  }))

  useEffect(() => {
    let plyr: any = null

    const initPlyr = async () => {
      if (videoRef.current) {
        try {
          // Dynamic import of Plyr to avoid SSR issues
          const Plyr = (await import('plyr')).default
          
          plyr = new Plyr(videoRef.current, {
            controls: [
              'play-large',
              'play',
              'progress', 
              'current-time',
              'duration',
              'mute',
              'volume',
              'settings',
              'fullscreen'
            ],
            settings: ['quality', 'speed'],
            quality: {
              default: 576,
              options: [1080, 720, 576, 480, 360, 240]
            },
            speed: {
              selected: 1,
              options: [0.5, 0.75, 1, 1.25, 1.5, 2]
            },
            seekTime: 10,
            volume: 0.8,
            clickToPlay: true,
            hideControls: false,
            resetOnEnd: false,
            keyboard: {
              focused: true,
              global: false
            },
            tooltips: {
              controls: true,
              seek: true
            },
            captions: {
              active: false,
              language: 'auto'
            }
          })

          plyrRef.current = plyr

          // Event listeners
          plyr.on('play', () => {
            onPlay?.()
          })

          plyr.on('pause', () => {
            onPause?.()
          })

          plyr.on('timeupdate', () => {
            onTimeUpdate?.(plyr.currentTime)
          })

          plyr.on('durationchange', () => {
            onDurationChange?.(plyr.duration)
          })

          // Load styles dynamically
          if (!document.querySelector('link[href*="plyr.css"]')) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = 'https://cdn.plyr.io/3.7.8/plyr.css'
            document.head.appendChild(link)
          }

        } catch (error) {
          console.error('Failed to initialize Plyr:', error)
        }
      }
    }

    initPlyr()

    return () => {
      if (plyr) {
        try {
          plyr.destroy()
        } catch (error) {
          console.error('Error destroying Plyr:', error)
        }
      }
    }
  }, [src, onTimeUpdate, onPlay, onPause, onDurationChange])

  return (
    <div className={`plyr-wrapper ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full"
        poster={poster}
        preload="metadata"
        crossOrigin="anonymous"
        playsInline
      >
        <source src={src} type="video/mp4" />
        <p>
          Your browser doesn't support HTML5 video. Here is a{' '}
          <a href={src} download>
            link to the video
          </a>{' '}
          instead.
        </p>
      </video>
    </div>
  )
})

PlyrWrapper.displayName = 'PlyrWrapper'

export default PlyrWrapper 