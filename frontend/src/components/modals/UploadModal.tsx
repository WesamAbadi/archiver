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
  
  // Updated state for multiple uploads
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>(['']);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'UNLISTED'>('PUBLIC');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [uploadedMediaIds, setUploadedMediaIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ [key: string]: any }>({});
  const [isMultiMode, setIsMultiMode] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleUploadProgress = (data: UploadProgress & { jobId: string; mediaId?: string }) => {
      if (isUploading) {
        // Handle batch progress
        setBatchProgress(prev => ({
          ...prev,
          [data.jobId]: data
        }));

        // Update overall progress for single uploads or last item in batch
        if (!isMultiMode || Object.keys(batchProgress).length === 1) {
          setUploadProgress({ ...data, error: data.error || false });
        }
        
        // Capture media ID when upload is complete
        if (data.stage === 'complete' && data.mediaId) {
          setUploadedMediaIds(prev => [...prev, data.mediaId!]);
          // Invalidate queries to refresh the pages
          refreshPages();
        }
      }
    };

    socket.on('upload-progress', handleUploadProgress);
    return () => {
      socket.off('upload-progress', handleUploadProgress);
    };
  }, [socket, isUploading, setUploadProgress, isMultiMode, batchProgress]);

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
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      
      // Auto-generate titles from filenames for multiple files
      if (selectedFiles.length === 1) {
        setTitle(selectedFiles[0].name.replace(/\.[^/.]+$/, ''));
      } else {
        setTitle(''); // Clear title for batch uploads - will use individual filenames
      }
      
      setIsMultiMode(selectedFiles.length > 1);
    }
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
    
    // Add new URL input if this is the last one and has content
    if (index === urls.length - 1 && value.trim()) {
      setUrls([...newUrls, '']);
    }
    
    // Remove empty URLs except the last one
    if (!value.trim() && index < urls.length - 1) {
      setUrls(newUrls.filter((_, i) => i !== index));
    }
    
    const nonEmptyUrls = newUrls.filter(url => url.trim());
    setIsMultiMode(nonEmptyUrls.length > 1);
  };

  const removeUrl = (index: number) => {
    if (urls.length > 1) {
      const newUrls = urls.filter((_, i) => i !== index);
      setUrls(newUrls.length === 0 ? [''] : newUrls);
      setIsMultiMode(newUrls.filter(url => url.trim()).length > 1);
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
    const nonEmptyUrls = urls.filter(url => url.trim());
    const hasUrls = nonEmptyUrls.length > 0;
    const hasFiles = files.length > 0;
    
    if (!hasUrls && !hasFiles) return;
    if (hasUrls && hasFiles) {
      alert('Please upload either files OR URLs, not both at the same time.');
      return;
    }
    
    // Reset state when starting a new upload
    handleStartNewUpload();
    setBatchProgress({});
    setUploadedMediaIds([]);
    
    startUpload();

    try {
      const token = await getToken();

      if (hasUrls) {
        // Batch URL uploads
        await handleBatchUrlUpload(nonEmptyUrls, token);
      } else {
        // Batch file uploads
        await handleBatchFileUpload(files, token);
      }

    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') {
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
        
        if (typeof errorMessage === 'string') {
          if (errorMessage.includes('Storage limit reached') || error.response.status === 413) {
            errorMessage = 'Storage limit reached';
            errorDetails = 'Please free up space by deleting some files before uploading.';
          } else if (errorMessage.includes('SoundCloud download failed') || 
              errorMessage.includes('Status code 404') ||
              errorMessage.includes('private or unavailable')) {
            errorMessage = 'Invalid or unavailable URL';
            errorDetails = 'One or more URLs are invalid, private, or the content has been removed';
          } else if (errorMessage.includes('Download failed')) {
            errorMessage = 'Unable to download content';
            errorDetails = 'Please check the URLs and try again';
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
    }
  };

  const handleBatchUrlUpload = async (urlList: string[], token: string) => {
    try {
      // Create abort controller for batch upload
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await axios.post(`${API_BASE}/api/media/batch-submit`, { 
        urls: urlList,
        description: isMultiMode ? '' : description, 
        visibility, 
        tags: isMultiMode ? [] : tags
      }, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal
      });

      return response.data?.data;
    } catch (error) {
      console.error('Failed to start batch URL upload:', error);
      throw error;
    }
  };

  const handleBatchFileUpload = async (fileList: File[], token: string) => {
    try {
      // Create abort controller for batch upload
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const formData = new FormData();
      
      // Append all files
      fileList.forEach((file, index) => {
        formData.append('files', file);
      });
      
      formData.append('description', isMultiMode ? '' : description);
      formData.append('visibility', visibility);
      formData.append('tags', JSON.stringify(isMultiMode ? [] : tags));

      const response = await axios.post(`${API_BASE}/api/media/batch-upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data', 
          Authorization: `Bearer ${token}` 
        },
        signal: abortController.signal,
        onUploadProgress: (e) => {
          if (e.total && !isMultiMode) { // Only show detailed progress for single uploads
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

      return response.data?.data;
    } catch (error) {
      console.error('Failed to start batch file upload:', error);
      throw error;
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
    setFiles([]);
    setUrls(['']);
    setTitle('');
    setDescription('');
    setVisibility('PUBLIC');
    setTags([]);
    setTagInput('');
    setUploadedMediaIds([]);
    setBatchProgress({});
    setIsMultiMode(false);
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

  const isUrlMode = urls.some(url => url.trim().length > 0);
  const hasCompletedUploads = uploadedMediaIds.length > 0;

  const footer = (
    <div className="flex justify-end space-x-3">
      {hasCompletedUploads ? (
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
          {uploadedMediaIds.length === 1 ? (
            <a
              href={`/watch/${uploadedMediaIds[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
            >
              <Play className="w-4 h-4 mr-2" />
              Watch Now
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          ) : (
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
            >
              View Uploads ({uploadedMediaIds.length})
            </button>
          )}
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
            disabled={(isUrlMode ? !urls.some(url => url.trim()) : (!title && !isMultiMode) || files.length === 0) || isUploading}
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
              `Upload${isMultiMode ? ` (${files.length || urls.filter(url => url.trim()).length})` : ''}`
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
    setUploadedMediaIds([]);
    setBatchProgress({});
    jobIdRef.current = null;
  };

  const handleMultipleUploads = async () => {
    // Implementation of handleMultipleUploads
    // This function should return a Promise that resolves when all uploads are complete
    // and returns an array of media IDs
    // For now, we'll keep it simple and return an empty array
    return [];
  };

  // Add storage limit warning
  const showStorageLimitWarning = (totalSize: number) => {
    const GB = 1024 * 1024 * 1024;
    const warningThreshold = 0.8 * GB; // 80% of 1GB
    
    if (totalSize > GB) {
      return (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-center text-xs text-red-300">
            ⚠️ Total size ({(totalSize / (1024 * 1024)).toFixed(2)}MB) exceeds the 1GB storage limit
          </p>
        </div>
      );
    } else if (totalSize > warningThreshold) {
      return (
        <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <p className="text-center text-xs text-yellow-300">
            ⚠️ Total size ({(totalSize / (1024 * 1024)).toFixed(2)}MB) is close to the 1GB storage limit
          </p>
        </div>
      );
    }
    return null;
  };

  // Update file display section to include storage warning
  const renderFileSection = () => {
    if (files.length === 0) return null;
    
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    return (
      <>
        {files.length === 1 ? (
          <div className="space-y-2">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl mx-auto flex items-center justify-center">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <p className="text-white font-medium">{files[0].name}</p>
            <p className="text-gray-400 text-sm">{(files[0].size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl mx-auto flex items-center justify-center">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <p className="text-white font-medium">{files.length} files selected</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between text-sm bg-gray-800/50 rounded px-3 py-2">
                  <span className="text-gray-300 truncate flex-1">{file.name}</span>
                  <span className="text-gray-400 ml-2">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-sm">
              Total: {(totalSize / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}
        {showStorageLimitWarning(totalSize)}
      </>
    );
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
                    Import from URL{urls.filter(url => url.trim()).length > 1 ? 's' : ''}
                  </label>
                  <div className="space-y-3">
                    {urls.map((url, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={url}
                          onChange={(e) => handleUrlChange(index, e.target.value)}
                          placeholder={index === 0 ? "Paste YouTube, SoundCloud, or Twitter URL" : "Add another URL..."}
                          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        />
                        {urls.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeUrl(index)}
                            className="px-3 py-3 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-xl transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {urls.filter(url => url.trim()).length > 1 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Processing {urls.filter(url => url.trim()).length} URLs. Titles will be auto-generated from content.
                    </p>
                  )}
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
                          multiple
                        />
                        {files.length > 0 ? renderFileSection() : (
                          <div className="space-y-3">
                            <div className="w-16 h-16 bg-gray-700 rounded-xl mx-auto flex items-center justify-center">
                              <Upload className="w-8 h-8 text-gray-400" />
                            </div>
                            <div>
                              <p className="text-gray-300 font-medium">Click to select file(s)</p>
                              <p className="text-gray-500 text-sm">MP4, MOV, MP3, WAV, JPG, PNG (max 100MB each)</p>
                              <p className="text-gray-600 text-xs mt-1">Hold Ctrl/Cmd to select multiple files</p>
                              <p className="text-gray-500 text-xs mt-2">Total storage limit: 1GB</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {files.length > 1 && (
                        <div className="mt-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                          <p className="text-center text-xs text-blue-300">
                            📁 Batch upload mode: Titles will be auto-generated from filenames. You can edit individual titles after upload.
                          </p>
                        </div>
                      )}

                      {/* Form Fields */}
                      <div className="space-y-4">
                        {!isMultiMode && (
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
                        )}

                        {isMultiMode && (
                          <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
                            <p className="text-yellow-300 text-sm">
                              <strong>Batch Upload Mode:</strong> Individual titles will be auto-generated from filenames or content metadata. 
                              You can edit titles individually after upload.
                            </p>
                          </div>
                        )}

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Description {isMultiMode ? '(applied to all)' : ''}
                          </label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                            placeholder={isMultiMode ? "Optional description for all uploads" : "Tell viewers about your content"}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Visibility {isMultiMode ? '(applied to all)' : ''}
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
                            Tags {isMultiMode ? '(applied to all)' : ''}
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