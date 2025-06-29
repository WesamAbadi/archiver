import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Lock, Users, Upload, Play, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useUpload, UploadProgress } from '../../contexts/UploadContext';
import { useQueryClient } from 'react-query';
import { useLocation } from 'react-router-dom';
import Modal from './Modal';

// Use relative URLs - axios will use the current domain
const API_BASE = '';

export default function UploadModal() {
  const { user, getToken } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const location = useLocation();
  const {
    isUploading,
    uploadProgress,
    startUpload,
    finishUpload,
    setUploadProgress,
    showUploadModal,
    setShowUploadModal,
  } = useUpload();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'UNLISTED'>('PUBLIC');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [uploadedMediaId, setUploadedMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleUploadProgress = (data: UploadProgress & { jobId: string; mediaId?: string }) => {
      if (isUploading && !jobIdRef.current && data.jobId) {
        jobIdRef.current = data.jobId;
      }
      if (data.jobId === jobIdRef.current) {
        setUploadProgress({ ...data, error: data.error || false });
        
        // Capture media ID when upload is complete
        if (data.stage === 'complete' && data.mediaId) {
          setUploadedMediaId(data.mediaId);
          // Invalidate queries to refresh the pages
          refreshPages();
        }
      }
    };

    socket.on('upload-progress', handleUploadProgress);
    return () => {
      socket.off('upload-progress', handleUploadProgress);
    };
  }, [socket, isUploading, setUploadProgress]);

  // Function to refresh page data after upload
  const refreshPages = () => {
    // Invalidate relevant queries to refresh the UI
    queryClient.invalidateQueries(['public-media']);
    queryClient.invalidateQueries(['user-media']);
    
    // If we're on the homepage or dashboard, refetch the data
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      // Force refetch for these pages
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('upload-completed'));
      }, 1000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (url.trim()) {
      if (!url) return;
    } else {
      if (!title || !file) return;
    }
    
    // Reset state when starting a new upload
    handleStartNewUpload();
    
    startUpload();

    // Create abort controller for this upload
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const token = await getToken();
      let response;

      if (url.trim()) {
        response = await axios.post(`${API_BASE}/api/media/submit`, { 
          url, title, description, visibility, tags 
        }, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal
        });
      } else {
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('visibility', visibility);
        formData.append('tags', JSON.stringify(tags));

        response = await axios.post(`${API_BASE}/api/media/upload`, formData, {
          headers: { 
            'Content-Type': 'multipart/form-data', 
            Authorization: `Bearer ${token}` 
          },
          signal: abortController.signal,
          onUploadProgress: (e) => {
            if (e.total) {
              const progress = Math.round((e.loaded * 100) / e.total);
              setUploadProgress((prev) => ({
                ...prev,
                stage: 'upload',
                progress,
                message: `Uploading to server... ${progress}%`,
                details: `${(e.loaded / 1024 / 1024).toFixed(2)}MB / ${(e.total / 1024 / 1024).toFixed(2)}MB`,
              }));
            }
          }
        });
      }

      if (!jobIdRef.current && response.data?.data?.jobId) {
        jobIdRef.current = response.data.data.jobId;
      }

      // If immediate response has mediaId, set it
      if (response.data?.data?.mediaId) {
        setUploadedMediaId(response.data.data.mediaId);
        refreshPages();
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') {
        // Request was cancelled - this is expected
        console.log('Upload cancelled by user');
        return;
      }

      console.error('Upload failed:', error);
      
      let errorMessage = 'Upload failed';
      let errorDetails = '';
      
      if (axios.isAxiosError(error) && error.response) {
        const responseData = error.response.data;
        if (responseData?.message) {
          errorMessage = responseData.message;
        } else if (responseData?.error) {
          errorMessage = responseData.error;
        }
        
        // Handle specific URL validation errors
        if (typeof errorMessage === 'string') {
          if (errorMessage.includes('SoundCloud download failed') || 
              errorMessage.includes('Status code 404') ||
              errorMessage.includes('private or unavailable')) {
            errorMessage = 'Invalid or unavailable URL';
            errorDetails = 'The URL you provided is either invalid, private, or the content has been removed';
          } else if (errorMessage.includes('Download failed')) {
            errorMessage = 'Unable to download content';
            errorDetails = 'Please check the URL and try again';
          }
        }
      } else {
        errorDetails = error instanceof Error ? error.message : String(error);
      }
      
      setUploadProgress({
        stage: 'error',
        progress: 100,
        message: errorMessage,
        details: errorDetails,
        error: true,
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    // Only trigger completion logic if we're actively uploading
    if (isUploading && (uploadProgress.stage === 'complete' || uploadProgress.error)) {
      finishUpload();
    }
  }, [uploadProgress.stage, uploadProgress.error, finishUpload, isUploading]);
  
  const handleDismiss = () => {
    setShowUploadModal(false);
    // Always reset state when closing the modal completely
    finishUpload();
    setUploadProgress({
      stage: 'upload',
      progress: 0,
      message: '',
      details: '',
      error: false,
    });
    resetForm();
  };

  const resetForm = () => {
    setFile(null);
    setUrl('');
    setTitle('');
    setDescription('');
    setVisibility('PUBLIC');
    setTags([]);
    setTagInput('');
    setUploadedMediaId(null);
    jobIdRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current = null;
    }
  };
  
  const handleCancel = () => {
    if (!isUploading) {
      handleDismiss();
      return;
    }
    setIsCancelling(true);
  };

  const confirmCancel = async () => {
    // First, abort the current HTTP request if it's still ongoing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Then, send cancellation request to backend if we have a job ID
    if (jobIdRef.current) {
      try {
        const token = await getToken();
        // Use a new abort controller for the cancel request
        const cancelController = new AbortController();
        await axios.post(`${API_BASE}/api/media/cancel`, { 
          jobId: jobIdRef.current 
        }, { 
          headers: { Authorization: `Bearer ${token}` },
          signal: cancelController.signal,
          timeout: 5000 // 5 second timeout for cancel request
        });
      } catch (error) {
        console.error('Failed to send cancellation request:', error);
        // Don't show error to user - cancellation should still proceed
      }
    }
    
    // Reset all state
    setUploadProgress({
      stage: 'upload',
      progress: 0,
      message: 'Upload cancelled',
      details: '',
      error: true,
    });
    finishUpload();
    setShowUploadModal(false);
    setIsCancelling(false);
    resetForm();
  };

  const getProgressColor = () => {
    if (uploadProgress.error) return 'bg-red-600';
    switch (uploadProgress.stage) {
      case 'upload': return 'bg-blue-600';
      case 'download': return 'bg-cyan-600';
      case 'b2': return 'bg-purple-600';
      case 'gemini': return 'bg-green-600';
      case 'transcription': return 'bg-yellow-600';
      case 'complete': return 'bg-emerald-600';
      default: return 'bg-blue-600';
    }
  };

  const getStageIcon = () => {
    if (uploadProgress.error) return '❌';
    switch (uploadProgress.stage) {
      case 'upload': return '📤';
      case 'download': return '📥';
      case 'b2': return '☁️';
      case 'gemini': return '🤖';
      case 'transcription': return '📝';
      case 'complete': return '✅';
      default: return '📤';
    }
  };

  const isUrlMode = url.trim().length > 0;

  const footer = (
    <div className="flex justify-end space-x-3">
      {uploadProgress.stage === 'complete' && uploadedMediaId ? (
        <>
          <button
            type="button"
            onClick={() => {
              handleStartNewUpload();
            }}
            className="px-6 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Start New Upload
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-6 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
          <a
            href={`/watch/${uploadedMediaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
          >
            <Play className="w-4 h-4 mr-2" />
            Watch Now
            <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleCancel}
            className="px-6 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            disabled={isUploading && uploadProgress.stage === 'complete'}
          >
            {isUploading && uploadProgress.stage !== 'complete' ? 'Cancel Upload' : 'Cancel'}
          </button>
          <button
            type="submit"
            form="upload-form"
            className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 transition-all"
            disabled={(isUrlMode ? !url.trim() : (!title || !file)) || isUploading}
          >
            {isUploading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              'Upload'
            )}
          </button>
        </>
      )}
    </div>
  );

  const handleStartNewUpload = () => {
    // Reset state when starting a new upload
    setUploadProgress({
      stage: 'upload',
      progress: 0,
      message: '',
      details: '',
      error: false,
    });
    setUploadedMediaId(null);
    jobIdRef.current = null;
  };

  return (
    <>
      {/* Cancel Confirmation Modal - Higher z-index */}
      <Modal
        isOpen={isCancelling}
        onClose={() => setIsCancelling(false)}
        title="Cancel Upload?"
        maxWidth="sm"
        className="!z-[60]"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsCancelling(false)}
              className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Keep Uploading
            </button>
            <button
              onClick={confirmCancel}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Yes, Cancel
            </button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-gray-400">
            Are you sure you want to cancel this upload? This will stop the current process and any files being processed will be cleaned up.
          </p>
        </div>
      </Modal>

      {/* Main Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={handleDismiss}
        title="Upload Content"
        maxWidth="2xl"
        closeOnBackdrop={!isUploading}
        className="!z-50"
        footer={footer}
      >
        <form id="upload-form" onSubmit={(e) => { e.preventDefault(); handleUpload(); }} className="p-6 space-y-6">
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{getStageIcon()}</span>
                    <div className="flex-1">
                      <p className="text-white font-medium">{uploadProgress.message}</p>
                      {uploadProgress.details && (
                        <p className="text-gray-400 text-sm mt-1">{uploadProgress.details}</p>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${getProgressColor()} transition-all duration-300 ease-out`}
                      style={{ width: `${uploadProgress.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-400">
                    <span>{uploadProgress.stage.charAt(0).toUpperCase() + uploadProgress.stage.slice(1)}</span>
                    <span>{uploadProgress.progress}%</span>
                  </div>
                  {uploadProgress.stage !== 'upload' && uploadProgress.stage !== 'complete' && !uploadProgress.error && (
                    <div className="mt-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                      <p className="text-center text-xs text-blue-300">
                        🚀 Your upload is processing on our servers. You can safely close this window - we'll notify you when it's complete!
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!isUploading && (
              <motion.div
                initial={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-6"
              >
                {/* URL Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Import from URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste YouTube, SoundCloud, or Twitter URL"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* OR Divider - only show when no URL */}
                <AnimatePresence>
                  {!isUrlMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="relative flex items-center">
                        <div className="flex-grow border-t border-gray-700"></div>
                        <span className="flex-shrink mx-4 text-gray-400 text-sm font-medium">OR</span>
                        <div className="flex-grow border-t border-gray-700"></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* File Upload and Form - only show when no URL */}
                <AnimatePresence>
                  {!isUrlMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden space-y-4"
                    >
                      {/* File Input */}
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-gray-600 hover:bg-gray-800/50 transition-all"
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileSelect}
                          className="hidden"
                          accept="video/*,audio/*,image/*"
                        />
                        {file ? (
                          <div className="space-y-2">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl mx-auto flex items-center justify-center">
                              <Upload className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-white font-medium">{file.name}</p>
                            <p className="text-gray-400 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="w-16 h-16 bg-gray-700 rounded-xl mx-auto flex items-center justify-center">
                              <Upload className="w-8 h-8 text-gray-400" />
                            </div>
                            <div>
                              <p className="text-gray-300 font-medium">Click to select file</p>
                              <p className="text-gray-500 text-sm">MP4, MOV, MP3, WAV, JPG, PNG (max 100MB)</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Form Fields */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                            placeholder="Enter a title"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Description
                          </label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                            placeholder="Tell viewers about your content"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Visibility
                          </label>
                          <div className="grid grid-cols-3 gap-3">
                            <button
                              type="button"
                              onClick={() => setVisibility('PUBLIC')}
                              className={`flex items-center justify-center px-4 py-3 rounded-xl border transition-all ${
                                visibility === 'PUBLIC'
                                  ? 'bg-green-500/20 border-green-500 text-green-400'
                                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              <Globe className="w-4 h-4 mr-2" />
                              Public
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibility('UNLISTED')}
                              className={`flex items-center justify-center px-4 py-3 rounded-xl border transition-all ${
                                visibility === 'UNLISTED'
                                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Unlisted
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibility('PRIVATE')}
                              className={`flex items-center justify-center px-4 py-3 rounded-xl border transition-all ${
                                visibility === 'PRIVATE'
                                  ? 'bg-red-500/20 border-red-500 text-red-400'
                                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              <Lock className="w-4 h-4 mr-2" />
                              Private
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Tags
                          </label>
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                            placeholder="Add tags and press Enter"
                          />
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {tags.map((tag, index) => (
                                <span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-700 text-gray-200 rounded-lg text-sm">
                                  {tag}
                                  <button 
                                    type="button"
                                    onClick={() => handleRemoveTag(index)} 
                                    className="text-gray-400 hover:text-white ml-1"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Modal>
    </>
  );
} 