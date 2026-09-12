import React, { createContext, useContext, useEffect, useState } from 'react'
import { authService, User } from '../lib/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  getToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user)
      setLoading(false)
    })

    // Validate a stored token once on boot, so a revoked or expired session
    // doesn't leave the UI pretending to be signed in.
    authService.verifySession().finally(() => setLoading(false))

    return unsubscribe
  }, [])

  const login = async (username: string, password: string) => {
    setLoading(true)
    try {
      await authService.login(username, password)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await authService.logout()
    } finally {
      setLoading(false)
    }
  }

  const getToken = async (): Promise<string | null> => {
    return authService.getToken()
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    getToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
} 