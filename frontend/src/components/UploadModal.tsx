import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useUpload, UploadProgress } from '../contexts/UploadContext';

export default function UploadModal() {
  const { user, getToken } = useAuth();
  const { socket } = useSocket();
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
  
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'UNLISTED'>('PRIVATE');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleUploadProgress = (data: UploadProgress & { jobId: string }) => {
      if (isUploading && !jobIdRef.current && data.jobId) {
        jobIdRef.current = data.jobId;
      }
      if (data.jobId === jobIdRef.current) {
        setUploadProgress({ ...data, error: data.error || false });
      }
    };

    socket.on('upload-progress', handleUploadProgress);
    return () => {
      socket.off('upload-progress', handleUploadProgress);
    };
  }, [socket, isUploading, setUploadProgress]);

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
    if (!title || (!file && !url)) return;
    startUpload();
    jobIdRef.current = null;

    try {
      const token = await getToken();
      let response;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('visibility', visibility);
        formData.append('tags', JSON.stringify(tags));

        response = await axios.post('/api/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
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
      } else {
        response = await axios.post('/api/media/submit', { url, title, description, visibility, tags }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      if (!jobIdRef.current && response.data?.data?.jobId) {
        jobIdRef.current = response.data.data.jobId;
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadProgress({
        stage: 'error',
        progress: 100,
        message: 'Upload failed',
        details: error instanceof Error ? error.message : String(error),
        error: true,
      });
    }
  };

  useEffect(() => {
    if (uploadProgress.stage === 'complete' || uploadProgress.error) {
      finishUpload();
    }
  }, [uploadProgress.stage, uploadProgress.error, finishUpload]);
  
  const handleDismiss = () => {
    setShowUploadModal(false);
  };
  
  const handleCancel = () => {
    if (!isUploading) {
      setShowUploadModal(false);
      return;
    }
    setIsCancelling(true);
  };

  const confirmCancel = async () => {
    if (isUploading && jobIdRef.current) {
      try {
        const token = await getToken();
        await axios.post('/api/media/cancel', { jobId: jobIdRef.current },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (error) {
        console.error('Failed to send cancellation request:', error);
      }
    }
    setShowUploadModal(false);
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
  
  if (!showUploadModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <AnimatePresence>
        {isCancelling && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm border border-gray-700">
              <h3 className="text-lg font-semibold text-white">Cancel Upload?</h3>
              <p className="text-gray-400 mt-2">Are you sure you want to cancel this upload? This will stop the current process.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setIsCancelling(false)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors">
                  Keep Uploading
                </button>
                <button onClick={confirmCancel} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Yes, Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-700">
        <div className="border-b border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Upload content</h2>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <AnimatePresence>
            {isUploading && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden">
                <div className="mb-6 p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{getStageIcon()}</span>
                    <div className="flex-1">
                      <p className="text-white font-medium">{uploadProgress.message}</p>
                      {uploadProgress.details && (<p className="text-gray-400 text-sm">{uploadProgress.details}</p>)}
                    </div>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-3 overflow-hidden">
                    <div className={`h-full ${getProgressColor()} transition-all duration-300 ease-out`} style={{ width: `${uploadProgress.progress}%` }}/>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-400">
                    <span>{uploadProgress.stage.charAt(0).toUpperCase() + uploadProgress.stage.slice(1)}</span>
                    <span>{uploadProgress.progress}%</span>
                  </div>
                  {uploadProgress.stage !== 'upload' && uploadProgress.stage !== 'complete' && !uploadProgress.error && (
                    <p className="text-center text-xs text-gray-400 mt-3">
                      Your upload is processing on our servers. You can safely close this window.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!isUploading && (
              <motion.div initial={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex gap-2 mb-6">
                  <button onClick={() => setActiveTab('file')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                    Upload file
                  </button>
                  <button onClick={() => setActiveTab('url')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'url' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                    Import from URL
                  </button>
                </div>
                {activeTab === 'file' ? (
                  <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition-colors">
                    <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" accept="video/*,audio/*,image/*"/>
                    {file ? (
                      <div>
                        <p className="text-white font-medium">{file.name}</p>
                        <p className="text-gray-400 text-sm mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <div>
                        <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-gray-300">Click to select file</p>
                        <p className="text-gray-500 text-sm mt-1">MP4, MOV, MP3, WAV, JPG, PNG (max 100MB)</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste YouTube, SoundCloud, or Twitter URL"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                )}
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Title*</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter a title"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Tell viewers about your content"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="PRIVATE">Private</option>
                      <option value="UNLISTED">Unlisted</option>
                      <option value="PUBLIC">Public</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleAddTag}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Add tags and press Enter"/>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {tags.map((tag, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-600 text-gray-200 rounded text-sm">
                          {tag}
                          <button onClick={() => handleRemoveTag(index)} className="text-gray-400 hover:text-white">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-gray-700 p-4 flex items-center justify-between">
          <button onClick={handleCancel} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isUploading && uploadProgress.stage === 'complete'}>
            {isUploading && uploadProgress.stage !== 'complete' ? 'Cancel Upload' : 'Close'}
          </button>
          <button onClick={handleUpload} disabled={!title || (!file && !url) || isUploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isUploading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : ( 'Upload' )}
          </button>
        </div>
      </div>
    </div>
  );
} 