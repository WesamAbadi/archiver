# ArchiveDrop 📁

A web app that downloads media from YouTube, SoundCloud, Twitter and more, stores them in your Backblaze B2 bucket, and auto-generates captions/metadata using AI.

## Features

- **Multi-platform**: YouTube, SoundCloud, Twitter, direct uploads
- **AI-powered**: Auto-generated captions, descriptions, and tags (Gemini)
- **Cloud storage**: Your own Backblaze B2 bucket
- **Smart search**: Full-text search across content and captions
- **Privacy controls**: Public/private sharing
- **Caption queue**: Independent AI transcription with rate limiting

## Tech Stack

- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express + PostgreSQL + Prisma
- Storage: Backblaze B2
- AI: Google Gemini API
- Auth: Google OAuth

## Quick Setup

1. **Clone and install**
```bash
git clone <repo-url>
cd archiver
npm install
```

2. **Database setup**
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

3. **Configure environment**

Backend `.env`:
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/archivedrop"
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-jwt-secret
B2_APPLICATION_KEY_ID=your-b2-key-id
B2_APPLICATION_KEY=your-b2-application-key
B2_BUCKET_ID=your-b2-bucket-id
BUCKET_NAME=your-bucket-name
GEMINI_API_KEY=your-gemini-api-key
CAPTION_JOBS_PER_MINUTE=2
CAPTION_JOBS_PER_DAY=1000
PORT=3003
```

Frontend `.env`:
```env
VITE_API_URL=http://localhost:3003/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

4. **Run**
```bash
# Start both frontend and backend
npm run dev
```

Access at http://localhost:5173

## Services Needed

- **PostgreSQL**: Database
- **Backblaze B2**: File storage ([sign up](https://www.backblaze.com/b2))
- **Google Cloud**: OAuth + Gemini API ([console](https://console.cloud.google.com))

## Caption Queue

Upload → Process → Queue for AI captions → Generate transcripts

- Rate limited to respect API quotas
- Shows queue position and estimated time
- Retry failed jobs automatically
- Status tracking: Pending → Queued → Processing → Complete

## License

MIT 