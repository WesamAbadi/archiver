import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useUpload } from '../contexts/UploadContext'
import { SearchBar } from './SearchBar'
import UploadModal from './modals/UploadModal'
import { FiHome, FiSearch, FiUpload, FiUser, FiBell } from 'react-icons/fi'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { isUploading, uploadProgress, showUploadModal, setShowUploadModal } = useUpload()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-gray-900 border-b border-gray-700 z-50 hidden md:block">
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
          </div>

          <div className="flex-1 max-w-2xl mx-8">
            <SearchBar />
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <button
                onClick={() => setShowUploadModal(true)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  isUploading 
                    ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm">{uploadProgress.progress}%</span>
                  </>
                ) : (
                  'Upload'
                )}
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
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-50 md:hidden">
        <div className="flex items-center justify-around h-16">
          <Link
            to="/"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              isActive('/') ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <FiHome className="w-6 h-6" />
            <span className="text-xs">Home</span>
          </Link>

          <Link
            to="/search"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              isActive('/search') ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <FiSearch className="w-6 h-6" />
            <span className="text-xs">Search</span>
          </Link>

          {user && (
            <button
              onClick={() => setShowUploadModal(true)}
              className={`flex flex-col items-center gap-1 px-4 py-2 ${
                isUploading ? 'text-purple-500' : 'text-gray-400'
              }`}
            >
              <FiUpload className="w-6 h-6" />
              <span className="text-xs">
                {isUploading ? `${uploadProgress.progress}%` : 'Upload'}
              </span>
            </button>
          )}

          <Link
            to="/notifications"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              isActive('/notifications') ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <FiBell className="w-6 h-6" />
            <span className="text-xs">Alerts</span>
          </Link>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`flex flex-col items-center gap-1 px-4 py-2 ${
                  isActive('/dashboard') ? 'text-blue-500' : 'text-gray-400'
                }`}
              >
                <FiUser className="w-6 h-6" />
                <span className="text-xs">Profile</span>
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: -10 }}
                    exit={{ opacity: 0, y: 0 }}
                    className="absolute bottom-full right-0 mb-2 w-48 bg-gray-800 rounded-lg shadow-lg py-1 border border-gray-700"
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
              className="flex flex-col items-center gap-1 px-4 py-2 text-gray-400"
            >
              <FiUser className="w-6 h-6" />
              <span className="text-xs">Login</span>
            </Link>
          )}
        </div>
      </nav>

      <UploadModal />
    </>
  )
} 