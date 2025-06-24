import React from 'react'
import { Play, Music, Image as ImageIcon, Grid3X3 } from 'lucide-react'

interface MediaFiltersProps {
  activeFilter: 'all' | 'video' | 'audio' | 'image'
  onFilterChange: (filter: 'all' | 'video' | 'audio' | 'image') => void
}

export function MediaFilters({ activeFilter, onFilterChange }: MediaFiltersProps) {
  const filters = [
    {
      value: 'all' as const,
      label: 'All Content',
      icon: Grid3X3,
      color: 'text-[var(--accent-purple)]',
      activeColor: 'var(--accent-purple)',
    },
    {
      value: 'video' as const,
      label: 'Videos',
      icon: Play,
      color: 'text-[var(--accent-red)]',
      activeColor: 'var(--accent-red)',
    },
    {
      value: 'audio' as const,
      label: 'Audio',
      icon: Music,
      color: 'text-[var(--accent-orange)]',
      activeColor: 'var(--accent-orange)',
    },
    {
      value: 'image' as const,
      label: 'Images',
      icon: ImageIcon,
      color: 'text-[var(--accent-blue)]',
      activeColor: 'var(--accent-blue)',
    },
  ]

  return (
    <div className="card-gaming p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {filters.map((filter) => {
          const Icon = filter.icon
          const isActive = activeFilter === filter.value
          
          return (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`
                relative p-4 rounded-xl border-2 transition-all duration-300 group hover-lift
                ${isActive 
                  ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 shadow-gaming' 
                  : 'border-[var(--border-primary)] hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-hover)]'
                }
              `}
              style={{
                borderColor: isActive ? filter.activeColor : undefined,
                backgroundColor: isActive ? `${filter.activeColor}20` : undefined,
              }}
            >
              <div className="flex flex-col items-center space-y-3">
                <div className={`p-2 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? 'bg-[var(--bg-secondary)] shadow-sm' 
                    : 'group-hover:bg-[var(--bg-secondary)]'
                }`}>
                  <Icon 
                    className={`w-6 h-6 transition-colors duration-300 ${
                      isActive ? filter.color : 'text-[var(--text-secondary)] group-hover:' + filter.color
                    }`} 
                  />
                </div>
                <span className={`text-sm font-medium transition-colors duration-300 ${
                  isActive 
                    ? 'text-[var(--text-primary)]' 
                    : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                }`}>
                  {filter.label}
                </span>
              </div>
              
              {isActive && (
                <div 
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: filter.activeColor }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
} 