import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useUpload } from '../contexts/UploadContext'
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

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="relative flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors overflow-hidden"
                >
                  <AnimatePresence>
                    {isUploading && !showUploadModal ? (
                      <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: '100%', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="absolute inset-0"
                      >
                        <div
                          className={`h-full ${getProgressColor()}`}
                          style={{ width: `${uploadProgress.progress}%` }}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">
                      {isUploading ? `Uploading... ${uploadProgress.progress}%` : 'Upload'}
                    </span>
                  </div>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-600 hover:border-gray-500 transition-colors"
                  >
                    <img
                      src={user.photoURL || '/default-avatar.png'}
                      alt={user.displayName || 'User'}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1">
                      <Link
                        to="/dashboard"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Studio
                      </Link>
                      <Link
                        to="/settings"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Settings
                      </Link>
                      <hr className="my-1 border-gray-700" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
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
      </nav>

      <UploadModal />
    </>
  )
} 