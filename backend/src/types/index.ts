import { User as PrismaUser, MediaItem as PrismaMediaItem, MediaFile as PrismaMediaFile, DownloadJob as PrismaDownloadJob, Platform, DownloadStatus, Visibility, SortOrder } from '@prisma/client';

// Re-export Prisma enums
export { Platform, DownloadStatus, Visibility, SortOrder };

// Enhanced types that include relations
export interface User extends PrismaUser {
  mediaItems?: MediaItem[];
  downloadJobs?: DownloadJob[];
}

export interface MediaItem extends PrismaMediaItem {
  user?: User;
  files?: MediaFile[];
  downloadJobs?: DownloadJob[];
}

export interface MediaFile extends PrismaMediaFile {
  mediaItem?: MediaItem;
}

export interface DownloadJob extends PrismaDownloadJob {
  user?: User;
  mediaItem?: MediaItem;
}

// Legacy interface for backward compatibility
export interface UserPreferences {
  defaultVisibility: Visibility;
  sortOrder: SortOrder;
  autoGenerateMetadata: boolean;
  notificationsEnabled: boolean;
}

// Legacy interface for backward compatibility - now flattened in MediaItem
export interface MediaMetadata {
  duration?: number;
  size: bigint;
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