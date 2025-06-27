# CDN & Plyr Player Setup Guide

This guide explains how to configure your Fastly CDN and the new Plyr media player with HLS support.

## 🎥 New Media Player Features

Your application now includes:
- **Plyr** - Modern, accessible media player with custom controls
- **HLS.js** - Support for adaptive streaming (`.m3u8` files)
- **CDN Integration** - Serve files through Fastly CDN instead of direct Backblaze B2

## 📡 CDN Configuration

### 1. Add CDN Environment Variable

In your `backend/.env` file, add:

```env
# CDN Configuration (Optional)
# If set, will serve files through CDN instead of direct B2 URLs
# Format: just the domain without https:// prefix
CDN_URL=lately-robust-thrush.global.ssl.fastly.net
```

### 2. URL Format Conversion

**Before (Direct B2):**
```
https://f005.backblazeb2.com/file/archiver-app/users/102678673714259272192/1750791680514-soundcloud_1750791676915.mp3
```

**After (CDN):**
```
https://lately-robust-thrush.global.ssl.fastly.net/users/102678673714259272192/1750791680514-soundcloud_1750791676915.mp3
```

### 3. Update Existing URLs

Use the fix-urls endpoint to update all existing media items:

```bash
POST /api/media/fix-urls
Authorization: Bearer <your-token>
```

Response will indicate if CDN URLs are being used:
```json
{
  "success": true,
  "message": "Fixed download URLs for 15 media items (using CDN)"
}
```

### 4. Test CDN Configuration

Use the test endpoint to verify CDN URL generation:

```bash
GET /api/media/test-cdn
Authorization: Bearer <your-token>
```

Example response:
```json
{
  "success": true,
  "data": {
    "testFileName": "users/102678673714259272192/test-file.mp3",
    "generatedUrl": "https://lately-robust-thrush.global.ssl.fastly.net/users/102678673714259272192/test-file.mp3",
    "usingCDN": true,
    "cdnDomain": "lately-robust-thrush.global.ssl.fastly.net"
  }
}
```

## 🎮 New Media Player (Plyr)

### Features Included

- **Video & Audio Support** - Unified player for all media types
- **HLS Streaming** - Automatic detection and playback of `.m3u8` files
- **Modern Controls** - Play/pause, seek, volume, fullscreen
- **Quality Selection** - Multiple quality options (1080p, 720p, 480p, 360p)
- **Playback Speed** - Variable speed control (0.5x to 2x)
- **Keyboard Shortcuts** - Space, arrow keys, etc.
- **Mobile Friendly** - Touch controls and responsive design

### Supported Formats

- **Video**: MP4, WebM, HLS (.m3u8)
- **Audio**: MP3, WAV, OGG, AAC
- **Streaming**: Adaptive bitrate streaming with HLS

### Usage

The MediaPlayer component is automatically used in `WatchPage.tsx`:

```jsx
<MediaPlayer
  src={fileUrl}
  type="video" // or "audio"
  title={mediaTitle}
  className="w-full h-full"
/>
```

## 🔧 Configuration Options

### Backend Environment Variables

```env
# Required for CDN
CDN_URL=your-cdn-domain.com

# Existing B2 config (still needed for uploads)
B2_APPLICATION_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-key
B2_BUCKET_ID=your-bucket-id
B2_BUCKET_NAME=your-bucket-name
```

### Frontend Dependencies Added

```json
{
  "hls.js": "^1.4.14",
  "plyr": "^3.7.8"
}
```

## 🚀 Migration Steps

1. **Add CDN_URL** to your backend `.env` file
2. **Install dependencies**: `pnpm install` (already done)
3. **Restart backend** to load new environment variable
4. **Call fix-urls endpoint** to update existing media items
5. **Test with test-cdn endpoint** to verify configuration

## 🔍 Troubleshooting

### CDN Not Working?
- Check that `CDN_URL` is set in backend `.env`
- Verify CDN domain is accessible
- Test with `/api/media/test-cdn` endpoint

### Player Not Loading?
- Check browser console for errors
- Verify file URLs are accessible
- Test with different media formats

### HLS Not Working?
- Ensure `.m3u8` files are accessible via CDN
- Check CORS headers on CDN
- Verify HLS.js is loaded correctly

## 📊 Benefits

- **Faster Loading** - CDN edge caching reduces latency
- **Better UX** - Modern player with smooth controls
- **Adaptive Streaming** - Automatic quality adjustment
- **Cost Reduction** - Less bandwidth usage from B2
- **Global Reach** - Fastly's worldwide edge network

## 🔗 Related Files

- `backend/src/services/BackblazeService.ts` - CDN URL generation
- `frontend/src/components/MediaPlayer.tsx` - Plyr component
- `frontend/src/pages/WatchPage.tsx` - Player integration
- `backend/src/routes/media.ts` - CDN test endpoints 