import axios from 'axios'
import { authService } from './auth'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

// Request interceptor to add auth token
api.interceptors.request.use(async (config) => {
  try {
    const token = authService.getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (error) {
    console.error('Failed to get auth token:', error)
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token and redirect to login
      authService.signOut()
      if (window.location.pathname !== '/login') {
        console.log('API 401 error, redirecting to login')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface MediaItem {
  id: string
  userId: string
  originalUrl: string
  platform: string
  title: string
  description?: string
  // Flattened metadata fields from new schema
  duration?: number
  size: number
  format: string
  resolution?: string
  thumbnailUrl?: string
  originalAuthor?: string
  originalTitle?: string
  originalDescription?: string
  publishedAt?: string
  hashtags?: string[]
  aiSummary?: string
  aiKeywords?: string[]
  aiCaptions?: string
  aiGeneratedAt?: string
  files: {
    id: string
    filename: string
    originalName: string
    mimeType: string
    size: number
    downloadUrl: string
    isOriginal: boolean
    format: string
  }[]
  visibility: 'PRIVATE' | 'PUBLIC'
  tags: string[]
  createdAt: string
  updatedAt: string
  downloadStatus: 'PENDING' | 'DOWNLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  publicId?: string
}

export interface DownloadJob {
  id: string
  userId: string
  url: string
  platform: string
  status: 'PENDING' | 'DOWNLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  progress: number
  error?: string
  mediaItemId?: string
  createdAt: string
}

// Auth API
export const authAPI = {
  googleLogin: (token: string) => api.post('/auth/google', { token }),
  getMe: () => api.get('/auth/me'),
  updatePreferences: (preferences: any) => api.patch('/auth/preferences', preferences),
  updateProfile: (data: any) => api.patch('/auth/profile', data),
}

// Media API
export const mediaAPI = {
  submitUrl: (data: { url: string; visibility?: string; tags?: string[] }) => 
    api.post('/media/submit', data),
  
  uploadFile: (formData: FormData) => 
    api.post<APIResponse<MediaItem>>('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  
  getJobStatus: (jobId: string) => 
    api.get(`/media/job/${jobId}`),
  
  getMediaItem: (id: string) => 
    api.get(`/media/${id}`),
  
  updateMediaItem: (id: string, data: any) => 
    api.patch(`/media/${id}`, data),
  
  deleteMediaItem: (id: string) => 
    api.delete(`/media/${id}`),
  
  generateMetadata: (id: string) => 
    api.post<APIResponse<any>>(`/media/${id}/generate-metadata`),
}

// Archive API (Personal)
export const archiveAPI = {
  getArchive: (params?: { 
    page?: number; 
    limit?: number; 
    sortBy?: string; 
    sortOrder?: string; 
  }) => api.get('/archive', { params }),
  
  getStats: () => api.get('/archive/stats'),
}

// Public Content API
export const publicAPI = {
  // Get homepage feed
  getFeed: (params?: { 
    page?: number; 
    limit?: number; 
    type?: 'all' | 'video' | 'audio' | 'image';
  }) => api.get('/archive/feed', { params }),
  
  // Get trending content
  getTrending: (params?: { 
    limit?: number; 
    type?: 'all' | 'video' | 'audio' | 'image';
  }) => api.get('/archive/trending', { params }),
  
  // Get public media item with comments
  getMediaItem: (id: string) => 
    api.get(`/archive/media/${id}`),
  
  // Like/unlike media
  toggleLike: (id: string) => 
    api.post(`/archive/media/${id}/like`),
  
  // Add comment
  addComment: (id: string, content: string) => 
    api.post(`/archive/media/${id}/comment`, { content }),
}

// User API
export const userAPI = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data: any) => api.patch('/user/profile', data),
  getUsage: () => api.get('/user/usage'),
} 