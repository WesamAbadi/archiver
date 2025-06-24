# ArchiveDrop 📁

A lightweight web application that lets users submit media links (YouTube, SoundCloud, Twitter/X, TikTok, etc.) and automatically downloads, stores, and archives the media in their personal Backblaze B2 bucket. Metadata and descriptions are auto-generated using the Gemini API, and users can choose to keep uploads private or share them publicly.

## 🚀 Features

### Core Functionality
- **Multi-Platform Support**: Download content from YouTube, Twitter, TikTok, SoundCloud, and more
- **AI-Powered Metadata**: Automatic generation of descriptions, tags, and captions using Gemini AI
- **Cloud Storage**: Secure storage in personal Backblaze B2 buckets
- **Privacy Controls**: Granular privacy settings with public/private toggle
- **Fast Performance**: Optimized for speed with background processing and caching

### User Experience
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **Infinite Scroll**: Smooth browsing of large archives
- **Search & Filter**: Advanced filtering by platform, tags, date, and content
- **Direct Upload**: Support for direct file uploads in addition to URL-based archiving
- **Public Sharing**: Share individual items or entire public archives

## 🧱 Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + Node.js + TypeScript
- **Authentication**: Firebase Auth
- **Database**: Firestore
- **Storage**: Backblaze B2
- **AI Services**: Google Gemini API
- **Media Processing**: ytdl-core, FFmpeg

## 📋 Prerequisites

Before setting up ArchiveDrop, ensure you have:

1. **Node.js** (v18 or higher)
2. **Firebase Project** with Auth and Firestore enabled
3. **Backblaze B2 Account** with a bucket created
4. **Google Gemini API Key**
5. **Optional**: Redis for job queues (for production)

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd archiver
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

### 3. Backend Configuration

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your configuration:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Firebase Configuration (from Firebase Console)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_CLIENT_ID=your-client-id

# Backblaze B2 Configuration
B2_APPLICATION_KEY_ID=your-b2-key-id
B2_APPLICATION_KEY=your-b2-application-key
B2_BUCKET_ID=your-b2-bucket-id
B2_BUCKET_NAME=your-b2-bucket-name

# Gemini AI Configuration
GEMINI_API_KEY=your-gemini-api-key

# Optional: Redis for job queues
REDIS_URL=redis://localhost:6379

# CORS Settings
FRONTEND_URL=http://localhost:5173
```

### 4. Frontend Configuration

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env` with your Firebase config:

```env
# Firebase Configuration (from Firebase Console)
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-firebase-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id

# API Configuration
VITE_API_URL=http://localhost:3001/api
```

### 5. Firebase Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** and configure sign-in methods (Email/Password, Google)
3. Enable **Firestore** database
4. Download the service account key:
   - Go to Project Settings → Service Accounts
   - Generate new private key
   - Use the credentials in your backend `.env`

### 6. Backblaze B2 Setup

1. Create a [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) account
2. Create a new bucket for storing media files
3. Generate application keys with read/write permissions
4. Add the credentials to your backend `.env`

### 7. Gemini API Setup

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add the API key to your backend `.env`

## 🚀 Running the Application

### Development Mode

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run dev:backend
npm run dev:frontend
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### Production Build

```bash
# Build both frontend and backend
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
archiver/
├── backend/                 # Express.js backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── package.json
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   ├── lib/            # Utilities and API
│   │   └── types/          # TypeScript types
│   └── package.json
├── package.json            # Root package.json
└── README.md
```

## 🔧 Configuration Details

### Supported Platforms

Currently supported for media download:
- ✅ YouTube (implemented)
- 🚧 Twitter/X (placeholder)
- 🚧 TikTok (placeholder)  
- 🚧 SoundCloud (placeholder)
- ✅ Direct file upload

### File Processing

- Automatic format detection and conversion
- Thumbnail generation for videos
- Metadata extraction from original sources
- AI-powered content analysis and tagging

### Privacy & Security

- User-specific storage folders in B2
- Secure authentication with Firebase
- Private by default with optional public sharing
- Secure download URLs with expiration

## 🔒 Environment Variables Reference

### Backend (.env)
| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3001) |
| `NODE_ENV` | Environment | No (default: development) |
| `FIREBASE_*` | Firebase service account | Yes |
| `B2_*` | Backblaze B2 credentials | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `REDIS_URL` | Redis connection string | No |
| `FRONTEND_URL` | Frontend URL for CORS | No |

### Frontend (.env)
| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_FIREBASE_*` | Firebase web config | Yes |
| `VITE_API_URL` | Backend API URL | No |

## 🚧 Development

### Adding New Platforms

To add support for a new platform:

1. Add the platform type to `backend/src/types/index.ts`
2. Implement the download logic in `MediaDownloadService.ts`
3. Add platform detection in `urlUtils.ts`
4. Update the frontend platform filters

### Custom Storage Backends

The storage system is modular. To add a new storage backend:

1. Create a new service class implementing the storage interface
2. Update the dependency injection in the media service
3. Add configuration options

## 📝 API Documentation

### Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <firebase-id-token>
```

### Key Endpoints

#### Media Submission
```http
POST /api/media/submit
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=...",
  "visibility": "private",
  "tags": ["music", "favorite"]
}
```

#### Archive Browsing
```http
GET /api/archive?page=1&limit=20&platform=youtube&search=query
```

#### User Profile
```http
GET /api/auth/me
PATCH /api/auth/preferences
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the existing documentation
- Review the environment setup steps

## 🎯 Roadmap

- [ ] Complete Twitter/TikTok/SoundCloud integration
- [ ] Mobile app (React Native)
- [ ] Advanced search with AI
- [ ] Bulk operations
- [ ] Export to other platforms
- [ ] Collaborative archives
- [ ] Advanced analytics dashboard 