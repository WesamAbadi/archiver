import { Platform } from '../types';

export function detectPlatform(url: string): Platform | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube';
    }
    
    // Twitter/X
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return 'twitter';
    }
    
    // TikTok
    if (hostname.includes('tiktok.com')) {
      return 'tiktok';
    }
    
    // SoundCloud
    if (hostname.includes('soundcloud.com')) {
      return 'soundcloud';
    }
    
    // Instagram
    if (hostname.includes('instagram.com')) {
      return 'instagram';
    }
    
    // Twitch
    if (hostname.includes('twitch.tv')) {
      return 'twitch';
    }
    
    // Reddit
    if (hostname.includes('reddit.com')) {
      return 'reddit';
    }
    
    return null;
  } catch {
    return null;
  }
}

export function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractVideoId(url: string, platform: Platform): string | null {
  try {
    const urlObj = new URL(url);
    
    switch (platform) {
      case 'youtube':
        if (urlObj.hostname.includes('youtu.be')) {
          return urlObj.pathname.slice(1);
        }
        return urlObj.searchParams.get('v');
        
      case 'twitter':
        const twitterMatch = urlObj.pathname.match(/\/status\/(\d+)/);
        return twitterMatch ? twitterMatch[1] : null;
        
      case 'tiktok':
        const tiktokMatch = urlObj.pathname.match(/\/video\/(\d+)/);
        return tiktokMatch ? tiktokMatch[1] : null;
        
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace invalid filename characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

export function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/avi': 'avi',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  
  return mimeToExt[mimeType] || 'bin';
} 