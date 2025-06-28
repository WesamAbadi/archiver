import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useUpload } from '../contexts/UploadContext'
import { SearchBar } from './SearchBar'
import UploadModal from './modals/UploadModal'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { isUploading, uploadProgress, showUploadModal, setShowUploadModal } = useUpload()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const getProgressColor = () => {
    if (uploadProgress.error) return 'bg-red-600'
    switch (uploadProgress.stage) {
      case 'upload': return 'bg-blue-600'
      case 'download': return 'bg-cyan-600'
      case 'b2': return 'bg-purple-600'
      case 'gemini': return 'bg-green-600'
      case 'transcription': return 'bg-yellow-600'
      case 'complete': return 'bg-emerald-600'
      default: return 'bg-blue-600'
    }
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 bg-gray-900 border-b border-gray-700 z-50">
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-white">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </div>
              <span className="text-xl font-semibold">ArchiveDrop</span>
            </Link>

            <div className="hidden lg:flex items-center gap-6">
              <Link to="/" className="text-gray-300 hover:text-white transition-colors">
                Discover
              </Link>
              <Link to="/dashboard" className="text-gray-300 hover:text-white transition-colors">
                Studio
              </Link>
            </div>
          </div>

          <div className="flex-1 max-w-2xl mx-8">
            <SearchBar />
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload
              </button>
            )}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {user.displayName?.[0] || 'U'}
                      </span>
                    </div>
                  )}
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg py-1"
                    >
                      <Link
                        to="/dashboard"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        Dashboard
                      </Link>
                      <Link
                        to="/settings"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {isUploading && (
          <div className="h-1">
            <div
              className={`h-full transition-all ${getProgressColor()}`}
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
        )}
      </nav>

      <UploadModal />
    </>
  )
} 