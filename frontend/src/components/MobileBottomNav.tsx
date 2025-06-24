import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  Home, 
  TrendingUp, 
  Archive, 
  Plus,
  User
} from 'lucide-react'

export function MobileBottomNav() {
  const { user } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Trending', href: '/trending', icon: TrendingUp },
    { name: 'Upload', href: '/dashboard', icon: Plus, requiresAuth: true },
    { name: 'Archive', href: '/dashboard', icon: Archive, requiresAuth: true },
    { name: user ? 'Profile' : 'Login', href: user ? '/settings' : '/login', icon: User },
  ]

  const filteredNavigation = navigation.filter(item => 
    !item.requiresAuth || user
  )

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Background with backdrop blur */}
      <div className="bg-[var(--bg-secondary)]/95 backdrop-blur-md border-t border-[var(--border-primary)]">
        <div className="flex items-center justify-around py-2 px-4 max-w-md mx-auto">
          {filteredNavigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg transition-all duration-200 min-w-0 ${
                  active
                    ? 'text-[var(--accent-blue)] bg-[var(--accent-blue)]/10'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${
                  active 
                    ? 'bg-[var(--accent-blue)]/20' 
                    : ''
                }`}>
                  <Icon className={`w-5 h-5 ${
                    item.name === 'Upload' 
                      ? 'text-[var(--accent-green)]' 
                      : active 
                        ? 'text-[var(--accent-blue)]' 
                        : ''
                  }`} />
                </div>
                <span className={`text-xs mt-1 font-medium truncate max-w-full ${
                  item.name === 'Upload' 
                    ? 'text-[var(--accent-green)]' 
                    : active 
                      ? 'text-[var(--accent-blue)]' 
                      : ''
                }`}>
                  {item.name}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
      
      {/* Safe area for devices with home indicator */}
      <div className="h-safe-area-inset-bottom bg-[var(--bg-secondary)]" />
    </div>
  )
} 