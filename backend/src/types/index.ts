export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  defaultVisibility: 'private' | 'public';
  sortOrder: 'newest' | 'oldest' | 'title';
  autoGenerateMetadata: boolean;
  notificationsEnabled: boolean;
}

export interface MediaItem {
  id: string;
  userId: string;
  originalUrl: string;
  platform: Platform;
  title: string;
  description?: string;
  metadata: MediaMetadata;
  files: MediaFile[];
  visibility: 'private' | 'public';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  downloadStatus: DownloadStatus;
  publicId?: string;
}

export interface MediaMetadata {
  duration?: number;
  size: number;
  format: string;
  resolution?: string;
  thumbnailUrl?: string;
  originalAuthor?: string;
  originalTitle?: string;
  originalDescription?: string;
  publishedAt?: Date;
  hashtags?: string[];
  aiGenerated: {
    summary?: string;
    keywords?: string[];
    captions?: string;
    generatedAt: Date;
  };
}

export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  b2FileId: string;
  b2FileName: string;
  downloadUrl: string;
  isOriginal: boolean;
  format: string;
}

export type Platform = 
  | 'youtube' 
  | 'soundcloud' 
  | 'twitter' 
  | 'tiktok' 
  | 'instagram' 
  | 'twitch' 
  | 'reddit'
  | 'direct';

export type DownloadStatus = 
  | 'pending' 
  | 'downloading' 
  | 'processing' 
  | 'completed' 
  | 'failed';

export interface DownloadJob {
  id: string;
  userId: string;
  url: string;
  platform: Platform;
  status: DownloadStatus;
  progress: number;
  error?: string;
  mediaItemId?: string;
  createdAt: Date;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
} 