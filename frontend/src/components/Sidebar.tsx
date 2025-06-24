import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  Home, 
  TrendingUp, 
  Archive, 
  Settings, 
  User, 
  Plus,
  Search,
  Heart,
  Play,
  Music,
  Image as ImageIcon,
  LogOut
} from 'lucide-react'

export function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Trending', href: '/trending', icon: TrendingUp },
    { name: 'Search', href: '/search', icon: Search },
  ]

  const userNavigation = user ? [
    { name: 'My Archive', href: '/dashboard', icon: Archive },
    { name: 'Liked', href: '/liked', icon: Heart },
    { name: 'Settings', href: '/settings', icon: Settings },
  ] : []

  const categories = [
    { name: 'Videos', icon: Play, count: '2.4k' },
    { name: 'Music', icon: Music, count: '1.8k' },
    { name: 'Images', icon: ImageIcon, count: '892' },
  ]

  return (
    <div className="sidebar hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-50">
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800 flex-shrink-0">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-gaming rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold">📁</span>
            </div>
            <span className="text-xl font-bold text-gradient">ArchiveDrop</span>
          </Link>
        </div>

        {/* Search */}
        <div className="p-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search content..."
              className="search-bar pl-10"
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Main Navigation */}
          <nav className="px-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Categories */}
          <div className="px-4 mt-8">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Categories
            </h3>
            <div className="space-y-2">
              {categories.map((category) => {
                const Icon = category.icon
                return (
                  <div key={category.name} className="nav-link cursor-pointer">
                    <Icon className="w-5 h-5 mr-3" />
                    <span className="flex-1">{category.name}</span>
                    <span className="text-sm text-gray-400">{category.count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* User Section */}
          {user && (
            <div className="px-4 mt-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Library
              </h3>
              <div className="space-y-2">
                {userNavigation.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Section */}
        <div className="flex-shrink-0 border-t border-gray-800">
          {/* Upload Button */}
          {user && (
            <div className="p-4">
              <Link to="/dashboard" className="btn btn-primary w-full">
                <Plus className="w-4 h-4 mr-2" />
                Upload Content
              </Link>
            </div>
          )}

          {/* User Profile / Auth */}
          <div className="p-4">
            {user ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <img
                    src={user.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face`}
                    alt={user.displayName || 'User'}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user.displayName || 'User'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Link to="/login" className="btn btn-primary w-full">
                  Sign In
                </Link>
                <p className="text-xs text-gray-400 text-center">
                  Join to upload and like content
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 