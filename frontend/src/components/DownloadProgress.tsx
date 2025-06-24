import React, { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '../contexts/AuthContext'
import { X, CheckCircle, AlertCircle, Download, Upload, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

interface DownloadProgressProps {
  isVisible?: boolean
  jobId?: string
  onClose: () => void
}

interface ProgressUpdate {
  jobId: string
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  mediaItem?: any
  timestamp: string
}

export function DownloadProgress({ isVisible, jobId, onClose }: DownloadProgressProps) {
  const { user } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ProgressUpdate | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null)

  // Show modal if either isVisible is true or jobId is provided
  const shouldShow = isVisible || !!jobId

  useEffect(() => {
    if (shouldShow && user) {
      // Initialize socket connection
      const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3003')
      
      newSocket.on('connect', () => {
        setIsConnected(true)
        // Join user-specific room
        newSocket.emit('join-room', user.uid)
      })

      newSocket.on('joined-room', (data) => {
        // Room joined successfully
      })

      newSocket.on('disconnect', () => {
        setIsConnected(false)
      })

      newSocket.on('connect_error', (error) => {
        console.error('[PROGRESS] Connection error:', error)
        setIsConnected(false)
      })

      newSocket.on('download-progress', (data: ProgressUpdate) => {
        // Update progress for the current job or if we have a temporary job ID
        const isRelevantUpdate = !jobId || data.jobId === jobId || jobId.startsWith('temp_')
        
        if (isRelevantUpdate) {
          setCurrentProgress(data)
          
          // If we had a temporary job ID and got a real one, update it
          if (jobId?.startsWith('temp_') && !data.jobId.startsWith('temp_')) {
            // This will be handled by the parent component updating the jobId prop
          }
          
          // Show success toast when completed
          if (data.status === 'completed') {
            toast.success('Download completed successfully!')
            // Start countdown for auto-close
            let countdown = 3;
            setAutoCloseTimer(countdown);
            
            const countdownInterval = setInterval(() => {
              countdown--;
              setAutoCloseTimer(countdown);
              
              if (countdown <= 0) {
                clearInterval(countdownInterval);
                onClose();
              }
            }, 1000);
            
          } else if (data.status === 'failed') {
            toast.error(`Download failed: ${data.message}`)
            // Auto-close on failure too after a moment
            setTimeout(() => {
              onClose()
            }, 2000)
          }
        }
      })

      setSocket(newSocket)

      // If we have a jobId, immediately show the progress modal with initial state
      if (jobId) {
        setCurrentProgress({
          jobId,
          status: 'pending',
          progress: 0,
          message: 'Initializing download...',
          timestamp: new Date().toISOString()
        })
      }

      return () => {
        newSocket.disconnect()
        setSocket(null)
        setIsConnected(false)
      }
    }
  }, [shouldShow, user, onClose, jobId])

  if (!shouldShow) return null

  const getStatusIcon = () => {
    if (!currentProgress) return <Download className="w-5 h-5 animate-pulse" />
    
    switch (currentProgress.status) {
      case 'pending':
        return <Download className="w-5 h-5 animate-pulse text-[var(--accent-blue)]" />
      case 'downloading':
        return <Download className="w-5 h-5 animate-bounce text-[var(--accent-purple)]" />
      case 'processing':
        return <Upload className="w-5 h-5 animate-spin text-[var(--accent-orange)]" />
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-[var(--accent-green)]" />
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-[var(--accent-red)]" />
      default:
        return <Zap className="w-5 h-5 text-[var(--accent-blue)]" />
    }
  }

  const getStatusColor = () => {
    if (!currentProgress) return 'bg-[var(--accent-blue)]'
    
    switch (currentProgress.status) {
      case 'pending':
        return 'bg-[var(--accent-blue)]'
      case 'downloading':
        return 'bg-[var(--accent-purple)]'
      case 'processing':
        return 'bg-[var(--accent-orange)]'
      case 'completed':
        return 'bg-[var(--accent-green)]'
      case 'failed':
        return 'bg-[var(--accent-red)]'
      default:
        return 'bg-[var(--bg-secondary)]'
    }
  }

  const progress = currentProgress?.progress || 0
  const message = currentProgress?.message || 'Starting download...'
  const status = currentProgress?.status || 'pending'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm modal-backdrop">
      <div className="card-gaming p-8 w-full max-w-md mx-4 shadow-gaming modal-content">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              {status === 'completed' ? '🎉 Download Complete!' : 
               status === 'failed' ? '❌ Download Failed' :
               status === 'processing' ? '⚡ Processing...' :
               status === 'downloading' ? '📥 Downloading...' :
               '🚀 Starting Download'}
            </h3>
          </div>
          
          {/* Show close button for completed/failed, or always show for manual close */}
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 hover:bg-[var(--bg-hover)] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status */}
        <div className="flex items-center space-x-2 mb-6">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isConnected ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'}`} />
          <span className="text-sm text-[var(--text-secondary)]">
            {isConnected ? '🔗 Connected to server' : '⏳ Connecting to server...'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-3">
            <span className="flex items-center">
              {status === 'pending' && '⏳'}
              {status === 'downloading' && '📥'}
              {status === 'processing' && '⚡'}
              {status === 'completed' && '✅'}
              {status === 'failed' && '❌'}
              <span className="ml-2">{message}</span>
            </span>
            <span className="text-[var(--accent-blue)] font-bold">{Math.round(progress)}%</span>
          </div>
          
          <div className="progress-bar">
            <div
              className={`progress-fill ${getStatusColor()}`}
              style={{ width: `${Math.min(Math.max(progress, 5), 100)}%` }}
            />
          </div>
        </div>

        {/* Status Details */}
        <div className="text-sm text-[var(--text-secondary)] space-y-2 mb-6">
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={`capitalize font-medium ${
              status === 'completed' ? 'text-[var(--accent-green)]' : 
              status === 'failed' ? 'text-[var(--accent-red)]' : 
              status === 'processing' ? 'text-[var(--accent-orange)]' :
              status === 'downloading' ? 'text-[var(--accent-purple)]' :
              'text-[var(--accent-blue)]'
            }`}>
              {status === 'pending' ? '⏳ Pending' :
               status === 'downloading' ? '📥 Downloading' :
               status === 'processing' ? '⚡ Processing' :
               status === 'completed' ? '✅ Completed' :
               status === 'failed' ? '❌ Failed' : status}
            </span>
          </div>
          
          {currentProgress?.jobId && (
            <div className="flex justify-between">
              <span>Job ID:</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {currentProgress.jobId.slice(0, 8)}...
              </span>
            </div>
          )}
          
          {currentProgress?.timestamp && (
            <div className="flex justify-between">
              <span>Last Update:</span>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(currentProgress.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        {/* Completed Media Info */}
        {status === 'completed' && currentProgress?.mediaItem && (
          <div className="mb-6 p-4 bg-[var(--accent-green)]/10 rounded-xl border border-[var(--accent-green)]/20 slide-up">
            <div className="flex items-center space-x-2 mb-3">
              <CheckCircle className="w-5 h-5 text-[var(--accent-green)]" />
              <span className="font-medium text-[var(--accent-green)]">🎉 Media Archived Successfully</span>
            </div>
            <div className="text-sm text-[var(--text-secondary)] space-y-1">
              <div><strong className="text-[var(--text-primary)]">Title:</strong> {currentProgress.mediaItem.title}</div>
              {currentProgress.mediaItem.platform && (
                <div><strong className="text-[var(--text-primary)]">Platform:</strong> 
                  <span className="capitalize ml-1">{currentProgress.mediaItem.platform}</span>
                </div>
              )}
              {currentProgress.mediaItem.visibility === 'public' && (
                <div className="text-[var(--accent-blue)] text-xs mt-2">
                  🌐 This content is now public and discoverable by others!
                </div>
              )}
            </div>
            {autoCloseTimer && autoCloseTimer > 0 && (
              <div className="mt-3 text-xs text-[var(--text-muted)] text-center">
                Auto-closing in {autoCloseTimer} seconds... (click X to close now)
              </div>
            )}
          </div>
        )}

        {/* Error Details */}
        {status === 'failed' && (
          <div className="mb-6 p-4 bg-[var(--accent-red)]/10 rounded-xl border border-[var(--accent-red)]/20 slide-up">
            <div className="flex items-center space-x-2 mb-3">
              <AlertCircle className="w-5 h-5 text-[var(--accent-red)]" />
              <span className="font-medium text-[var(--accent-red)]">❌ Download Failed</span>
            </div>
            <div className="text-sm text-[var(--text-secondary)]">{message}</div>
            <div className="mt-3 text-xs text-[var(--text-muted)]">
              💡 Try checking the URL or try again later
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {(status === 'completed' || status === 'failed') && (
          <div className="flex justify-end space-x-3 slide-up">
            {status === 'failed' && (
              <button
                onClick={onClose}
                className="btn btn-secondary"
              >
                Try Again
              </button>
            )}
            <button
              onClick={onClose}
              className="btn btn-primary"
            >
              {status === 'completed' ? '🎉 Awesome!' : '✖️ Close'}
            </button>
          </div>
        )}

        {/* Loading animation for active downloads */}
        {(status === 'pending' || status === 'downloading' || status === 'processing') && (
          <div className="text-center text-xs text-[var(--text-muted)] animate-pulse">
            {status === 'pending' && '⏳ Preparing your download...'}
            {status === 'downloading' && '📥 Fetching content from source...'}
            {status === 'processing' && '⚡ Optimizing and storing securely...'}
          </div>
        )}
      </div>
    </div>
  )
} 