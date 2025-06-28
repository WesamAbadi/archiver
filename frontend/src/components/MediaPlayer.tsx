import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

// Import Plyr CSS
import 'plyr/dist/plyr.css';

interface MediaPlayerProps {
  src: string;
  type: 'video' | 'audio';
  title?: string;
  poster?: string;
  autoplay?: boolean;
  className?: string;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export interface MediaPlayerRef {
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
}

export const MediaPlayer = forwardRef<MediaPlayerRef, MediaPlayerProps>(({ 
  src, 
  type, 
  title, 
  poster, 
  autoplay = false, 
  className = '',
  onTimeUpdate,
  onPlay,
  onPause
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaElementRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Keep track of cleanup functions
  const cleanupRef = useRef<(() => void) | null>(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    get currentTime() {
      return mediaElementRef.current?.currentTime || 0;
    },
    get duration() {
      return mediaElementRef.current?.duration || 0;
    },
    play: () => {
      mediaElementRef.current?.play();
    },
    pause: () => {
      mediaElementRef.current?.pause();
    },
    seekTo: (time: number) => {
      if (mediaElementRef.current) {
        mediaElementRef.current.currentTime = time;
      }
    },
    setVolume: (volume: number) => {
      if (mediaElementRef.current) {
        mediaElementRef.current.volume = Math.max(0, Math.min(1, volume));
      }
    },
  }));

  useEffect(() => {
    let isMounted = true;
    
    const initializePlayer = async () => {
      if (!containerRef.current || !src) return;

      try {
        setIsLoading(true);
        setError(null);

        // Clear any existing cleanup
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }

        // Dynamically import Plyr and HLS to avoid SSR issues
        const [{ default: Plyr }, { default: Hls }] = await Promise.all([
          import('plyr'),
          import('hls.js')
        ]);

        if (!isMounted) return;

        // Create media element programmatically
        const mediaElement = document.createElement(type) as HTMLVideoElement | HTMLAudioElement;
        mediaElement.controls = true;
        mediaElement.crossOrigin = 'anonymous';
        mediaElement.preload = 'metadata';
        
        // Store reference to media element
        mediaElementRef.current = mediaElement;
        
        if (type === 'video') {
          (mediaElement as HTMLVideoElement).playsInline = true;
          if (poster) {
            (mediaElement as HTMLVideoElement).poster = poster;
          }
        }

        // Add event listeners for parent callbacks
        if (onTimeUpdate) {
          mediaElement.addEventListener('timeupdate', onTimeUpdate);
        }
        if (onPlay) {
          mediaElement.addEventListener('play', onPlay);
        }
        if (onPause) {
          mediaElement.addEventListener('pause', onPause);
        }

        // Create wrapper div for Plyr
        const playerWrapper = document.createElement('div');
        playerWrapper.style.width = '100%';
        playerWrapper.appendChild(mediaElement);

        // Clear container and add new player
        const container = containerRef.current;
        container.innerHTML = '';
        container.appendChild(playerWrapper);

        let hlsInstance: any = null;

        // Setup HLS if needed
        if (src.includes('.m3u8') && Hls.isSupported()) {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          
          hlsInstance.loadSource(src);
          hlsInstance.attachMedia(mediaElement);
          
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (isMounted) {
              setIsLoading(false);
              setIsReady(true);
            }
          });

          hlsInstance.on(Hls.Events.ERROR, (event: any, data: any) => {
            if (data.fatal && isMounted) {
              setError('Failed to load media stream');
              setIsLoading(false);
            }
          });
        } else {
          mediaElement.src = src;
        }

        // Initialize Plyr
        const plyrInstance = new Plyr(mediaElement, {
          controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'settings',
            ...(type === 'video' ? ['fullscreen'] : [])
          ],
          settings: ['speed'],
          speed: {
            selected: 1,
            options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
          },
          autoplay,
          clickToPlay: true,
          hideControls: true,
          seekTime: 10,
          volume: 0.8,
          keyboard: { focused: true, global: false }
        });

        plyrInstance.on('ready', () => {
          if (isMounted) {
            setIsLoading(false);
            setIsReady(true);
          }
        });

        plyrInstance.on('error', () => {
          if (isMounted) {
            setError('Failed to load media');
            setIsLoading(false);
          }
        });

        // Store cleanup function
        cleanupRef.current = () => {
          try {
            if (hlsInstance) {
              hlsInstance.destroy();
            }
          } catch (e) {
            console.warn('Error destroying HLS:', e);
          }
          
          try {
            if (plyrInstance) {
              plyrInstance.destroy();
            }
          } catch (e) {
            console.warn('Error destroying Plyr:', e);
          }

          // Clean up event listeners
          if (mediaElementRef.current) {
            if (onTimeUpdate) {
              mediaElementRef.current.removeEventListener('timeupdate', onTimeUpdate);
            }
            if (onPlay) {
              mediaElementRef.current.removeEventListener('play', onPlay);
            }
            if (onPause) {
              mediaElementRef.current.removeEventListener('pause', onPause);
            }
          }

          // Clean up DOM
          if (container && container.parentNode) {
            container.innerHTML = '';
          }

          mediaElementRef.current = null;
        };

        if (!hlsInstance) {
          setIsLoading(false);
          setIsReady(true);
        }

      } catch (err) {
        if (isMounted) {
          console.error('MediaPlayer initialization error:', err);
          setError('Failed to initialize player');
          setIsLoading(false);
        }
      }
    };

    initializePlayer();

    return () => {
      isMounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [src, type, poster, autoplay, onTimeUpdate, onPlay, onPause]);

  if (error) {
    return (
      <div className={`bg-gray-900 rounded-lg flex items-center justify-center min-h-[200px] ${className}`}>
        <div className="text-center p-8">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h3 className="text-white text-lg font-semibold mb-2">Playback Error</h3>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Audio Player - SoundCloud style */}
      {type === 'audio' && (
        <div className="w-full bg-gray-800 rounded-xl overflow-hidden">
          {/* Audio Waveform Visual */}
          <div className="relative h-32 bg-gradient-to-r from-blue-600/10 to-purple-600/10 flex items-center justify-center">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(0,212,255,0.1)_50%,transparent_100%)] animate-pulse"></div>
            <div className="text-4xl">🎵</div>
            {title && (
              <div className="absolute bottom-4 left-4 text-white font-medium bg-black/50 px-3 py-1 rounded-lg">
                {title}
              </div>
            )}
            {isReady && !isLoading && (
              <div className="absolute bottom-4 right-4 text-white text-sm bg-black/50 px-2 py-1 rounded">
                Ready
              </div>
            )}
          </div>
          
          {/* Plyr will be inserted here */}
          <div ref={containerRef} className="w-full" />
        </div>
      )}

      {/* Video Player */}
      {type === 'video' && (
        <div className="w-full bg-black rounded-xl overflow-hidden">
          {/* Plyr will be inserted here */}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/80 rounded-xl flex items-center justify-center z-20">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white font-medium">Loading player...</p>
          </div>
        </div>
      )}
    </div>
  );
});

MediaPlayer.displayName = 'MediaPlayer';

export default MediaPlayer; 