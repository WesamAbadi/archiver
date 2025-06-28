import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useAuth } from '../contexts/AuthContext'
import { userAPI } from '../lib/api'
import { Settings, User, Shield, Database, Save, Download, Trash2, Camera, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageContainer, Card, PageHeader } from '../components/common'

export function SettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState('profile')
  const [isUnsaved, setIsUnsaved] = useState(false)
  
  const { data: profile } = useQuery('user-profile', userAPI.getProfile)
  const { data: usage } = useQuery('user-usage', userAPI.getUsage)

  const updateProfileMutation = useMutation(userAPI.updateProfile, {
    onSuccess: () => {
      queryClient.invalidateQueries('user-profile')
      toast.success('Profile updated successfully')
      setIsUnsaved(false)
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

  const handleFieldChange = (field: string, value: any) => {
    setIsUnsaved(true)
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setProfileData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent as keyof typeof prev] as any,
          [child]: value
        }
      }))
    } else {
      setProfileData(prev => ({ ...prev, [field]: value }))
    }
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User, description: 'Personal information and preferences' },
    { id: 'privacy', name: 'Privacy', icon: Shield, description: 'Data and privacy settings' },
    { id: 'usage', name: 'Usage', icon: Database, description: 'Storage and analytics' },
  ]

  const getStoragePercentage = () => {
    if (!usage?.data?.success) return 0
    return Math.min((usage.data.data.storageUsed / usage.data.data.storageLimit) * 100, 100)
  }

  return (
    <PageContainer variant="default">
      <PageHeader 
        icon={Settings}
        title="Settings"
        description="Manage your account settings and preferences"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-col xl:flex-row gap-8">
          {/* Sidebar */}
          <div className="xl:w-80">
            <Card variant="gaming" className="sticky top-24">
              <nav className="p-4">
                <div className="space-y-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full group flex items-start p-4 text-left rounded-xl transition-all ${
                        activeTab === tab.id
                          ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white shadow-lg transform scale-[1.02]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <tab.icon className={`w-6 h-6 mr-4 mt-1 transition-transform group-hover:scale-110 ${
                        activeTab === tab.id ? 'text-white' : 'text-[var(--accent-blue)]'
                      }`} />
                      <div>
                        <div className="font-semibold">{tab.name}</div>
                        <div className={`text-sm mt-1 ${
                          activeTab === tab.id ? 'text-white/80' : 'text-[var(--text-muted)]'
                        }`}>
                          {tab.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Profile Header */}
                <Card variant="gaming" className="p-6 md:p-8">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="relative group">
                      <img
                        className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-[var(--border-primary)] object-cover transition-transform group-hover:scale-105"
                        src={user?.photoURL || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=128&h=128&fit=crop&crop=face`}
                        alt={user?.displayName || 'User'}
                      />
                      <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button className="text-white bg-black/50 rounded-lg p-2 hover:bg-black/70 transition-colors">
                          <Camera className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2">
                        {user?.displayName || 'User'}
                      </h2>
                      <p className="text-[var(--text-secondary)] mb-4">{user?.email}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-3 py-1 bg-[var(--accent-green)]/10 text-[var(--accent-green)] rounded-full text-sm font-medium">
                          <Check className="w-3 h-3 mr-1" />
                          Verified Account
                        </span>
                        <span className="inline-flex items-center px-3 py-1 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] rounded-full text-sm font-medium">
                          Pro User
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Profile Form */}
                <Card variant="gaming" className="p-6 md:p-8">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Personal Information</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <label htmlFor="displayName" className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                        Display Name
                      </label>
                      <input
                        type="text"
                        id="displayName"
                        value={profileData.displayName}
                        onChange={(e) => handleFieldChange('displayName', e.target.value)}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                        placeholder="Enter your display name"
                      />
                    </div>
                  </div>
                </Card>

                {/* Preferences */}
                <Card variant="gaming" className="p-6 md:p-8">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Preferences</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                        Default Visibility
                      </label>
                      <select
                        value={profileData.preferences.defaultVisibility}
                        onChange={(e) => handleFieldChange('preferences.defaultVisibility', e.target.value)}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                      >
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        This will be the default visibility for new uploads
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start space-x-4 p-4 rounded-lg border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                        <input
                          type="checkbox"
                          id="autoMetadata"
                          checked={profileData.preferences.autoGenerateMetadata}
                          onChange={(e) => handleFieldChange('preferences.autoGenerateMetadata', e.target.checked)}
                          className="w-5 h-5 mt-0.5 rounded border-[var(--border-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-[var(--bg-secondary)] transition-all"
                        />
                        <div className="flex-1">
                          <label htmlFor="autoMetadata" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer">
                            Auto-generate metadata with AI
                          </label>
                          <p className="text-sm text-[var(--text-muted)] mt-1">
                            Let AI help you organize your content by generating tags and descriptions
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-4 p-4 rounded-lg border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                        <input
                          type="checkbox"
                          id="notifications"
                          checked={profileData.preferences.notificationsEnabled}
                          onChange={(e) => handleFieldChange('preferences.notificationsEnabled', e.target.checked)}
                          className="w-5 h-5 mt-0.5 rounded border-[var(--border-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-[var(--bg-secondary)] transition-all"
                        />
                        <div className="flex-1">
                          <label htmlFor="notifications" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer">
                            Enable notifications
                          </label>
                          <p className="text-sm text-[var(--text-muted)] mt-1">
                            Get notified about important updates and activity on your content
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Save Button */}
                {isUnsaved && (
                  <Card variant="hover" className="p-4 bg-[var(--accent-blue)]/5 border-[var(--accent-blue)]/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[var(--accent-blue)] font-medium">You have unsaved changes</p>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => setIsUnsaved(false)}
                          className="btn btn-secondary text-sm"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Discard
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          disabled={updateProfileMutation.isLoading}
                          className="btn btn-primary text-sm"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          {updateProfileMutation.isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                {/* Public Archive */}
                <Card variant="gaming" className="p-6 md:p-8">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Public Archive</h3>
                  
                  <div className="space-y-4">
                    <p className="text-[var(--text-secondary)]">
                      Your public archive URL:
                    </p>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4 font-mono text-sm text-[var(--accent-blue)] flex items-center justify-between">
                      <span className="truncate">/u/{user?.uid}/public</span>
                      <button 
                        className="ml-4 btn btn-secondary text-xs px-3 py-1"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.origin + `/u/${user?.uid}/public`)
                          toast.success('URL copied to clipboard!')
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      Only items marked as "public" will be visible to others through this URL.
                    </p>
                  </div>
                </Card>

                {/* Data Export */}
                <Card variant="gaming" className="p-6 md:p-8">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Data Export</h3>
                  
                  <div className="space-y-4">
                    <p className="text-[var(--text-secondary)]">
                      Download all your archived data including metadata and file links.
                    </p>
                    <button className="btn btn-secondary inline-flex items-center">
                      <Download className="w-4 h-4 mr-2" />
                      Export My Data
                    </button>
                  </div>
                </Card>

                {/* Danger Zone */}
                <Card variant="hover" className="p-6 md:p-8 bg-[var(--accent-red)]/5 border-[var(--accent-red)]/20">
                  <h3 className="text-xl font-semibold text-[var(--accent-red)] mb-6">Danger Zone</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-[var(--accent-red)] mb-2">Delete Account</h4>
                      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
                        Permanently delete your account and all associated data. This action cannot be undone.
                        Make sure to backup any important data before proceeding.
                      </p>
                      <button className="bg-[var(--accent-red)] hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2">
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Account</span>
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'usage' && (
              <div className="space-y-6">
                {usage?.data?.success ? (
                  <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card variant="hover" className="p-6 bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-blue)]/5 border-[var(--accent-blue)]/20">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium text-[var(--text-secondary)]">Total Items</h3>
                          <div className="w-8 h-8 bg-[var(--accent-blue)]/20 rounded-lg flex items-center justify-center">
                            <Database className="w-4 h-4 text-[var(--accent-blue)]" />
                          </div>
                        </div>
                        <p className="text-3xl font-bold text-[var(--accent-blue)]">
                          {usage.data.data.totalItems}
                        </p>
                      </Card>
                      
                      <Card variant="hover" className="p-6 bg-gradient-to-br from-[var(--accent-purple)]/10 to-[var(--accent-purple)]/5 border-[var(--accent-purple)]/20">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium text-[var(--text-secondary)]">Storage Used</h3>
                          <div className="w-8 h-8 bg-[var(--accent-purple)]/20 rounded-lg flex items-center justify-center">
                            <Database className="w-4 h-4 text-[var(--accent-purple)]" />
                          </div>
                        </div>
                        <p className="text-3xl font-bold text-[var(--accent-purple)]">
                          {(usage.data.data.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          of {(usage.data.data.storageLimit / (1024 * 1024 * 1024)).toFixed(0)} GB limit
                        </p>
                      </Card>
                      
                      <Card variant="hover" className="p-6 bg-gradient-to-br from-[var(--accent-green)]/10 to-[var(--accent-green)]/5 border-[var(--accent-green)]/20">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium text-[var(--text-secondary)]">Downloads</h3>
                          <div className="w-8 h-8 bg-[var(--accent-green)]/20 rounded-lg flex items-center justify-center">
                            <Download className="w-4 h-4 text-[var(--accent-green)]" />
                          </div>
                        </div>
                        <p className="text-3xl font-bold text-[var(--accent-green)]">
                          {usage.data.data.recentDownloads}
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Last 30 days</p>
                      </Card>
                    </div>

                    {/* Storage Usage */}
                    <Card variant="gaming" className="p-6 md:p-8">
                      <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Storage Usage</h3>
                      
                      <div className="space-y-4">
                        <div className="bg-[var(--bg-secondary)] rounded-full h-4 border border-[var(--border-primary)] overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${getStoragePercentage()}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text-muted)]">
                            {getStoragePercentage().toFixed(1)}% used
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {(usage.data.data.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB of {(usage.data.data.storageLimit / (1024 * 1024 * 1024)).toFixed(0)} GB
                          </span>
                        </div>
                        
                        {getStoragePercentage() > 80 && (
                          <Card variant="hover" className="p-4 bg-[var(--accent-orange)]/5 border-[var(--accent-orange)]/20">
                            <p className="text-[var(--accent-orange)] text-sm font-medium">
                              ⚠️ Storage is getting full. Consider upgrading your plan or cleaning up old files.
                            </p>
                          </Card>
                        )}
                      </div>
                    </Card>
                  </>
                ) : (
                  <Card variant="gaming" className="p-8 md:p-12 text-center">
                    <Database className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-50" />
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                      Unable to load usage statistics
                    </h3>
                    <p className="text-[var(--text-secondary)] mb-4">
                      There was an error loading your usage data
                    </p>
                    <button className="btn btn-secondary">
                      Retry
                    </button>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
} 