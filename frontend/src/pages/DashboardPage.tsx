import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mediaAPI, archiveAPI } from '../lib/api'
import { DownloadProgress } from '../components/DownloadProgress'
import { 
  Plus, 
  Upload, 
  Link as LinkIcon, 
  Globe, 
  Lock,
  Tag,
  X,
  AlertCircle,
  Edit3,
  Trash2,
  Eye,
  MoreVertical,
  BarChart3,
  TrendingUp,
  Calendar,
  Download,
  Share2,
  Save,
  FileText,
  Filter,
  Search
} from 'lucide-react'
import toast from 'react-hot-toast'

interface EditModalProps {
  item: any
  isOpen: boolean
  onClose: () => void
  onSave: (id: string, data: any) => void
  isLoading: boolean
}

function EditModal({ item, isOpen, onClose, onSave, isLoading }: EditModalProps) {
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState(item?.description || '')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [tags, setTags] = useState<string[]>(item?.tags || [])
  const [newTag, setNewTag] = useState('')

  React.useEffect(() => {
    if (item) {
      setTitle(item.title || '')
      setDescription(item.description || '')
      setVisibility(item.visibility || 'private')
      setTags(item.tags || [])
    }
  }, [item])

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  const handleSave = () => {
    onSave(item.id, {
      title: title.trim(),
      description: description.trim(),
      visibility,
      tags: tags.filter(t => t.trim())
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm modal-backdrop">
      <div className="card-gaming p-8 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">✏️ Edit Content</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 hover:bg-[var(--bg-hover)] rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div className="slide-up" style={{ animationDelay: '100ms' }}>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
              placeholder="Enter a title..."
            />
          </div>

          {/* Description */}
          <div className="slide-up" style={{ animationDelay: '200ms' }}>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent resize-none transition-all"
              placeholder="Add a description..."
            />
          </div>

          {/* Visibility */}
          <div className="slide-up" style={{ animationDelay: '300ms' }}>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
              Visibility
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`p-4 rounded-xl border-2 transition-all text-left hover-lift ${
                  visibility === 'private' 
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' 
                    : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                <div className="flex items-center mb-2">
                  <Lock className="w-5 h-5 mr-2 text-[var(--text-secondary)]" />
                  <span className="font-medium text-[var(--text-primary)]">Private</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">Only you can see this</p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`p-4 rounded-xl border-2 transition-all text-left hover-lift ${
                  visibility === 'public' 
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' 
                    : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                <div className="flex items-center mb-2">
                  <Globe className="w-5 h-5 mr-2 text-[var(--accent-blue)]" />
                  <span className="font-medium text-[var(--text-primary)]">Public</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">Everyone can see this</p>
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="slide-up" style={{ animationDelay: '400ms' }}>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Tags
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                placeholder="Add a tag..."
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!newTag.trim()}
                className="btn btn-secondary"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] rounded-full text-sm hover-lift"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-2 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-8 slide-up" style={{ animationDelay: '500ms' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !title.trim()}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DeleteConfirmProps {
  item: any
  isOpen: boolean
  onClose: () => void
  onConfirm: (id: string) => void
  isLoading: boolean
}

function DeleteConfirmModal({ item, isOpen, onClose, onConfirm, isLoading }: DeleteConfirmProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm modal-backdrop">
      <div className="card-gaming p-8 w-full max-w-md mx-4 modal-content">
        <div className="text-center">
          <div className="w-16 h-16 bg-[var(--accent-red)]/20 rounded-full flex items-center justify-center mx-auto mb-4 scale-in">
            <Trash2 className="w-8 h-8 text-[var(--accent-red)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2 slide-up" style={{ animationDelay: '100ms' }}>
            Delete Content
          </h2>
          <p className="text-[var(--text-secondary)] mb-2 slide-up" style={{ animationDelay: '200ms' }}>
            Are you sure you want to delete "<span className="text-[var(--text-primary)] font-medium">{item?.title}</span>"?
          </p>
          <p className="text-sm text-[var(--accent-red)] mb-6 slide-up" style={{ animationDelay: '300ms' }}>
            This action cannot be undone and will permanently remove the content and all its data.
          </p>
          
          <div className="flex justify-center space-x-4 slide-up" style={{ animationDelay: '400ms' }}>
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(item.id)}
              disabled={isLoading}
              className="bg-[var(--accent-red)] hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="spinner w-4 h-4 mr-2"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [showProgress, setShowProgress] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [tagList, setTagList] = useState<string[]>([])
  const [view, setView] = useState<'upload' | 'manage'>('upload')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [editModal, setEditModal] = useState<{ isOpen: boolean; item: any }>({ isOpen: false, item: null })
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; item: any }>({ isOpen: false, item: null })

  // Get user's content with more details
  const { data: archiveData, isLoading: archiveLoading } = useQuery(
    ['user-archive-full'],
    () => archiveAPI.getArchive({ limit: 50 }),
    {
      refetchOnWindowFocus: false,
    }
  )

  const { data: statsData } = useQuery(
    ['archive-stats'],
    () => archiveAPI.getStats(),
    {
      refetchOnWindowFocus: false,
    }
  )

  // Edit mutation
  const editMutation = useMutation(
    ({ id, data }: { id: string; data: any }) => mediaAPI.updateMediaItem(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['user-archive-full'])
        queryClient.invalidateQueries(['archive-stats'])
        setEditModal({ isOpen: false, item: null })
        toast.success('Content updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to update content')
      }
    }
  )

  // Delete mutation
  const deleteMutation = useMutation(
    (id: string) => mediaAPI.deleteMediaItem(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['user-archive-full'])
        queryClient.invalidateQueries(['archive-stats'])
        setDeleteModal({ isOpen: false, item: null })
        toast.success('Content deleted successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to delete content')
      }
    }
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsSubmitting(true)
    
    // Generate a temporary job ID for immediate progress tracking
    const tempJobId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Show progress modal immediately
    setJobId(tempJobId)
    setShowProgress(true)
    
    try {
      const response = await mediaAPI.submitUrl({
        url: url.trim(),
        visibility,
        tags: tagList.length > 0 ? tagList : tags.split(',').map(t => t.trim()).filter(t => t)
      })
      
      const data = response.data
      if (data.success) {
        // Update with the real job ID from the server
        setJobId(data.data.jobId)
        
        // Clear form
        setUrl('')
        setTags('')
        setTagList([])
        
        // Success toast will be handled by the DownloadProgress component
      }
    } catch (error: any) {
      // Close progress modal on error
      setShowProgress(false)
      setJobId(null)
      toast.error(error.response?.data?.error || 'Failed to start download')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !tagList.includes(newTag.trim())) {
      setTagList([...tagList, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setTagList(tagList.filter(t => t !== tag))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  const handleEdit = (item: any) => {
    setEditModal({ isOpen: true, item })
  }

  const handleDelete = (item: any) => {
    setDeleteModal({ isOpen: true, item })
  }

  const allItems = archiveData?.data.data || []
  const stats = statsData?.data.data

  // Filter items
  const filteredItems = allItems.filter((item: any) => {
    const matchesSearch = !searchTerm || item.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesVisibility = filterVisibility === 'all' || item.visibility === filterVisibility
    return matchesSearch && matchesVisibility
  })

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    if (mb >= 1000) {
      return `${(mb / 1024).toFixed(1)} GB`
    } else if (mb >= 1) {
      return `${mb.toFixed(1)} MB`
    }
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const getEngagementData = (item: any) => {
    // Mock engagement data - replace with real data when available
    return {
      views: Math.floor(Math.random() * 1000),
      likes: Math.floor(Math.random() * 100),
      comments: Math.floor(Math.random() * 20)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-blue)]/10 via-[var(--accent-purple)]/5 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
                Creator Studio
              </h1>
              <p className="text-xl text-[var(--text-secondary)]">
                Manage your content like a pro
              </p>
            </div>
            
            {/* View Toggle */}
            <div className="flex bg-[var(--bg-secondary)] rounded-lg p-1 border border-[var(--border-primary)]">
              <button
                onClick={() => setView('upload')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  view === 'upload'
                    ? 'bg-[var(--accent-blue)] text-white shadow-gaming'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Upload
              </button>
              <button
                onClick={() => setView('manage')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  view === 'manage'
                    ? 'bg-[var(--accent-blue)] text-white shadow-gaming'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-2 inline" />
                Manage
              </button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="creator-stats-grid mb-8">
            <div className="stat-card">
              <div className="text-2xl font-bold text-[var(--accent-blue)] mb-1">{stats?.totalItems || 0}</div>
              <div className="text-sm text-[var(--text-secondary)]">Total Content</div>
            </div>
            <div className="stat-card">
              <div className="text-2xl font-bold text-[var(--accent-green)] mb-1">{stats?.visibilityBreakdown?.public || 0}</div>
              <div className="text-sm text-[var(--text-secondary)]">Public</div>
            </div>
            <div className="stat-card">
              <div className="text-2xl font-bold text-[var(--accent-purple)] mb-1">
                {stats?.totalSize ? `${(stats.totalSize / (1024 * 1024)).toFixed(1)}` : '0'}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">MB Used</div>
            </div>
            <div className="stat-card">
              <div className="text-2xl font-bold text-[var(--accent-orange)] mb-1">
                {stats?.recentActivity?.length || 0}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">Recent</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {view === 'upload' ? (
          /* Upload Section */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="card-gaming p-8">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-gradient-gaming rounded-xl flex items-center justify-center mr-4">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Upload Content</h2>
                    <p className="text-[var(--text-secondary)]">From YouTube, SoundCloud, Twitter, or direct upload</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* URL Input */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Content URL
                    </label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=... or https://soundcloud.com/..."
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg pl-12 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  {/* Visibility Toggle */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                      Visibility
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVisibility('private')}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          visibility === 'private' 
                            ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' 
                            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
                        }`}
                      >
                        <div className="flex items-center mb-2">
                          <Lock className="w-5 h-5 mr-2 text-[var(--text-secondary)]" />
                          <span className="font-medium text-[var(--text-primary)]">Private</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Only you can see this content
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisibility('public')}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          visibility === 'public' 
                            ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' 
                            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
                        }`}
                      >
                        <div className="flex items-center mb-2">
                          <Globe className="w-5 h-5 mr-2 text-[var(--accent-blue)]" />
                          <span className="font-medium text-[var(--text-primary)]">Public</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Everyone can discover this content
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Tags (Optional)
                    </label>
                    
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="Add a tag..."
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addTag}
                        disabled={!newTag.trim()}
                        className="btn btn-secondary px-4"
                      >
                        Add
                      </button>
                    </div>

                    {tagList.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tagList.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-3 py-1 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] rounded-full text-sm"
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-2 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !url.trim()}
                    className="btn btn-primary w-full btn-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="spinner w-5 h-5 mr-2"></div>
                        Starting Download...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Start Download
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Quick Tips Sidebar */}
            <div className="space-y-6">
              <div className="card-gaming p-6">
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">💡 Creator Tips</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-[var(--accent-blue)] rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p className="text-[var(--text-secondary)]">
                      Public content gets more engagement and visibility
                    </p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-[var(--accent-green)] rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p className="text-[var(--text-secondary)]">
                      Add relevant tags to help others discover your content
                    </p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-[var(--accent-purple)] rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p className="text-[var(--text-secondary)]">
                      High-quality content gets featured in trending
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Content Management Section */
          <div className="space-y-6">
            {/* Filters */}
            <div className="filter-section">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search your content..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-[var(--text-secondary)]" />
                  <select
                    value={filterVisibility}
                    onChange={(e) => setFilterVisibility(e.target.value as any)}
                    className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent"
                  >
                    <option value="all">All Content</option>
                    <option value="public">Public Only</option>
                    <option value="private">Private Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Content List */}
            {archiveLoading ? (
              <div className="text-center py-12">
                <div className="spinner w-8 h-8 mx-auto mb-4"></div>
                <p className="text-[var(--text-secondary)]">Loading your content...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16">
                <div className="card-gaming p-8 max-w-md mx-auto scale-in">
                  <div className="text-6xl mb-4">📁</div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    {searchTerm || filterVisibility !== 'all' ? 'No content found' : 'No content yet'}
                  </h3>
                  <p className="text-[var(--text-secondary)] mb-4">
                    {searchTerm || filterVisibility !== 'all' 
                      ? 'Try adjusting your search or filters' 
                      : 'Upload your first content to get started!'
                    }
                  </p>
                  {!searchTerm && filterVisibility === 'all' && (
                    <button
                      onClick={() => setView('upload')}
                      className="btn btn-primary"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Upload Content
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="content-grid">
                {filteredItems.map((item: any, index) => {
                  const engagement = getEngagementData(item)
                  return (
                    <div 
                      key={item.id} 
                      className="content-item content-row slide-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          {/* Thumbnail/Icon */}
                          <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center border border-[var(--border-primary)]">
                            <span className="text-2xl">
                              {item.platform === 'youtube' && '📺'}
                              {item.platform === 'twitter' && '🐦'}
                              {item.platform === 'soundcloud' && '🎧'}
                              {item.platform === 'direct' && '📄'}
                            </span>
                          </div>

                          {/* Content Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[var(--text-primary)] mb-1 truncate">
                              {item.title}
                            </h3>
                            <div className="flex items-center space-x-4 text-sm text-[var(--text-secondary)]">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                item.visibility === 'public' 
                                  ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]' 
                                  : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]'
                              }`}>
                                {item.visibility === 'public' ? (
                                  <><Globe className="w-3 h-3 mr-1" />Public</>
                                ) : (
                                  <><Lock className="w-3 h-3 mr-1" />Private</>
                                )}
                              </span>
                              <span className="capitalize">{item.platform}</span>
                              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="hidden md:flex items-center space-x-6 text-sm text-[var(--text-secondary)]">
                            <div className="flex items-center space-x-1 tooltip" data-tooltip="Views">
                              <Eye className="w-4 h-4" />
                              <span className="stat-number">{engagement.views}</span>
                            </div>
                            <div className="flex items-center space-x-1 tooltip" data-tooltip="Likes">
                              <TrendingUp className="w-4 h-4" />
                              <span className="stat-number">{engagement.likes}</span>
                            </div>
                            <div className="text-xs tooltip" data-tooltip="File size">
                              {formatFileSize(item.metadata?.size || item.files?.[0]?.size || 0)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="action-buttons flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-2 text-[var(--accent-blue)] hover:text-[var(--accent-purple)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors tooltip"
                            data-tooltip="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {item.visibility === 'public' && (
                            <button
                              onClick={() => window.open(`/watch/${item.id}`, '_blank')}
                              className="p-2 text-[var(--accent-green)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors tooltip"
                              data-tooltip="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-2 text-[var(--accent-red)] hover:text-red-400 hover:bg-[var(--bg-hover)] rounded-lg transition-colors tooltip"
                            data-tooltip="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        <EditModal
          item={editModal.item}
          isOpen={editModal.isOpen}
          onClose={() => setEditModal({ isOpen: false, item: null })}
          onSave={(id, data) => editMutation.mutate({ id, data })}
          isLoading={editMutation.isLoading}
        />

        <DeleteConfirmModal
          item={deleteModal.item}
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, item: null })}
          onConfirm={(id) => deleteMutation.mutate(id)}
          isLoading={deleteMutation.isLoading}
        />

        {/* Download Progress Modal */}
        {showProgress && jobId && (
          <DownloadProgress
            jobId={jobId}
            onClose={() => {
              setShowProgress(false)
              setJobId(null)
              queryClient.invalidateQueries(['user-archive-full'])
            }}
          />
        )}
      </div>
    </div>
  )
} 