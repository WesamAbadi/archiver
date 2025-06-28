import React, { createContext, useContext, useState, useRef } from 'react';

export interface UploadProgress {
  stage: 'upload' | 'download' | 'b2' | 'gemini' | 'transcription' | 'complete' | 'error';
  progress: number;
  message: string;
  details?: string;
  error?: boolean;
}

interface UploadContextType {
  isUploading: boolean;
  uploadProgress: UploadProgress;
  jobIdRef: React.RefObject<string | null>;
  startUpload: () => void;
  finishUpload: () => void;
  setUploadProgress: React.Dispatch<React.SetStateAction<UploadProgress>>;
  showUploadModal: boolean;
  setShowUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'upload',
    progress: 0,
    message: 'Preparing...',
  });

  const startUpload = () => {
    jobIdRef.current = null;
    setIsUploading(true);
    setShowUploadModal(true);
    setUploadProgress({
      stage: 'upload',
      progress: 0,
      message: 'Starting upload...',
    });
  };

  const finishUpload = () => {
    setIsUploading(false);
    jobIdRef.current = null;
    // Keep the modal open for a moment to show completion/error
    setTimeout(() => {
      setShowUploadModal(false);
    }, 2000);
  };

  const value = {
    isUploading,
    uploadProgress,
    jobIdRef,
    startUpload,
    finishUpload,
    setUploadProgress,
    showUploadModal,
    setShowUploadModal,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
} 