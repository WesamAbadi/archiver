import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useAuth } from '../contexts/AuthContext'
import { userAPI } from '../lib/api'
import { Settings, User, Shield, Database, Save, Download, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export function SettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState('profile')
  
  const { data: profile } = useQuery('user-profile', userAPI.getProfile)
  const { data: usage } = useQuery('user-usage', userAPI.getUsage)

  const updateProfileMutation = useMutation(userAPI.updateProfile, {
    onSuccess: () => {
      queryClient.invalidateQueries('user-profile')
      toast.success('Profile updated successfully')
    },
    onError: () => {
      toast.error('Failed to update profile')
    }
  })

  const [profileData, setProfileData] = useState({
    displayName: '',
    preferences: {
      defaultVisibility: 'private' as 'private' | 'public',
      autoGenerateMetadata: true,
      notificationsEnabled: true,
    }
  })

  React.useEffect(() => {
    if (profile?.data?.success) {
      setProfileData({
        displayName: profile.data.data.displayName || '',
        preferences: profile.data.data.preferences || {
          defaultVisibility: 'private',
          autoGenerateMetadata: true,
          notificationsEnabled: true,
        }
      })
    }
  }, [profile])

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(profileData)
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'privacy', name: 'Privacy', icon: Shield },
    { id: 'usage', name: 'Usage', icon: Database },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-purple)]/10 via-[var(--accent-blue)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
          <div className="flex items-center space-x-3 mb-4">
            <Settings className="w-8 h-8 text-[var(--accent-purple)]" />
            <h1 className="text-4xl md:text-5xl font-bold text-gradient">
              Settings
            </h1>
          </div>
          <p className="text-xl text-[var(--text-secondary)]">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-64">
            <nav className="card-gaming p-4">
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all ${
                      activeTab === tab.id
                        ? 'bg-[var(--accent-blue)] text-white shadow-gaming'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <tab.icon className="w-5 h-5 mr-3" />
                    {tab.name}
                  </button>
                ))}
              </div>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {activeTab === 'profile' && (
              <div className="card-gaming p-8">
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-8">Profile Information</h2>
                
                <div className="space-y-8">
                  <div className="flex items-center space-x-6">
                    <img
                      className="w-20 h-20 rounded-full border-2 border-[var(--border-primary)]"
                      src={user?.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face`}
                      alt={user?.displayName || 'User'}
                    />
                    <div>
                      <h3 className="text-xl font-semibold text-[var(--text-primary)]">{user?.displayName || 'User'}</h3>
                      <p className="text-[var(--text-secondary)]">{user?.email}</p>
                      <span className="inline-block mt-2 px-3 py-1 bg-[var(--accent-green)]/20 text-[var(--accent-green)] rounded-full text-sm">
                        Verified Account
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                      Display Name
                    </label>
                    <input
                      type="text"
                      id="displayName"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Preferences</h3>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                          Default Visibility
                        </label>
                        <select
                          value={profileData.preferences.defaultVisibility}
                          onChange={(e) => setProfileData(prev => ({
                            ...prev,
                            preferences: {
                              ...prev.preferences,
                              defaultVisibility: e.target.value as 'private' | 'public'
                            }
                          }))}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                        >
                          <option value="private">Private</option>
                          <option value="public">Public</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="autoMetadata"
                          checked={profileData.preferences.autoGenerateMetadata}
                          onChange={(e) => setProfileData(prev => ({
                            ...prev,
                            preferences: {
                              ...prev.preferences,
                              autoGenerateMetadata: e.target.checked
                            }
                          }))}
                          className="w-5 h-5 rounded border-[var(--border-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-[var(--bg-secondary)]"
                        />
                        <label htmlFor="autoMetadata" className="text-sm text-[var(--text-primary)]">
                          Auto-generate metadata with AI
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="notifications"
                          checked={profileData.preferences.notificationsEnabled}
                          onChange={(e) => setProfileData(prev => ({
                            ...prev,
                            preferences: {
                              ...prev.preferences,
                              notificationsEnabled: e.target.checked
                            }
                          }))}
                          className="w-5 h-5 rounded border-[var(--border-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-[var(--bg-secondary)]"
                        />
                        <label htmlFor="notifications" className="text-sm text-[var(--text-primary)]">
                          Enable notifications
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--border-primary)]">
                    <button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isLoading}
                      className="btn btn-primary"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateProfileMutation.isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="card-gaming p-8">
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-8">Privacy Settings</h2>
                
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Public Archive</h3>
                    <p className="text-[var(--text-secondary)] mb-4">
                      Your public archive URL: 
                    </p>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3 font-mono text-sm text-[var(--accent-blue)]">
                      /u/{user?.uid}/public
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mt-3">
                      Only items marked as "public" will be visible to others through this URL.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Data Export</h3>
                    <p className="text-[var(--text-secondary)] mb-4">
                      Download all your archived data including metadata and file links.
                    </p>
                    <button className="btn btn-secondary">
                      <Download className="w-4 h-4 mr-2" />
                      Export My Data
                    </button>
                  </div>

                  <div className="border-t border-[var(--border-primary)] pt-8">
                    <h3 className="text-lg font-semibold text-[var(--accent-red)] mb-3">Danger Zone</h3>
                    <div className="bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-lg p-6">
                      <h4 className="font-semibold text-[var(--accent-red)] mb-2">Delete Account</h4>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                      <button className="bg-[var(--accent-red)] hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Trash2 className="w-4 h-4 mr-2 inline" />
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'usage' && (
              <div className="card-gaming p-8">
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-8">Usage Statistics</h2>
                
                {usage?.data?.success ? (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-6 rounded-xl">
                        <h3 className="font-medium text-[var(--text-secondary)] mb-2">Total Items</h3>
                        <p className="text-3xl font-bold text-[var(--accent-blue)]">
                          {usage.data.data.totalItems}
                        </p>
                      </div>
                      
                      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-6 rounded-xl">
                        <h3 className="font-medium text-[var(--text-secondary)] mb-2">Storage Used</h3>
                        <p className="text-3xl font-bold text-[var(--accent-purple)]">
                          {(usage.data.data.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          of {(usage.data.data.storageLimit / (1024 * 1024 * 1024)).toFixed(0)} GB limit
                        </p>
                      </div>
                      
                      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-6 rounded-xl">
                        <h3 className="font-medium text-[var(--text-secondary)] mb-2">Recent Downloads</h3>
                        <p className="text-3xl font-bold text-[var(--accent-green)]">
                          {usage.data.data.recentDownloads}
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Last 30 days</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)] mb-4">Storage Usage</h3>
                      <div className="bg-[var(--bg-secondary)] rounded-full h-4 border border-[var(--border-primary)]">
                        <div 
                          className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${Math.min((usage.data.data.storageUsed / usage.data.data.storageLimit) * 100, 100)}%` 
                          }}
                        ></div>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-3">
                        {((usage.data.data.storageUsed / usage.data.data.storageLimit) * 100).toFixed(1)}% used
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[var(--text-secondary)] py-12">
                    <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Unable to load usage statistics</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 