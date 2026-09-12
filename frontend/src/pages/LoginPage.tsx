import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Zap, Lock, User as UserIcon, ArrowRight, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageContainer, Card } from '../components/common'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { user, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!username.trim() || !password) {
      toast.error('Enter your username and password')
      return
    }

    setIsLoading(true)
    try {
      await login(username.trim(), password)
      toast.success('Welcome back')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageContainer variant="default" className="flex items-center justify-center min-h-screen relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-r from-[var(--accent-blue)]/30 to-[var(--accent-purple)]/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-r from-[var(--accent-purple)]/30 to-[var(--accent-green)]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(var(--accent-blue-rgb),0.1),transparent_50%)]"></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <Card variant="gaming" className="p-6 md:p-8 backdrop-blur-xl bg-[var(--bg-card)]/95 border-2">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] rounded-3xl blur-lg opacity-75"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] rounded-3xl flex items-center justify-center shadow-2xl">
                  <Zap className="w-9 h-9 text-white drop-shadow-lg" />
                </div>
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--text-primary)] via-[var(--accent-blue)] to-[var(--accent-purple)] bg-clip-text text-transparent">
                ArchiveDrop
              </h1>
            </div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
              Admin sign in
            </h2>
            <p className="text-[var(--text-secondary)]">
              Sign in to manage your archive
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
              >
                Username
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  placeholder="admin"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]/40 transition-colors disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]/40 transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full group flex items-center justify-center gap-3 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white font-medium shadow-lg hover:shadow-xl hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                'Signing in…'
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[var(--border-primary)]">
            <p className="text-sm text-center text-[var(--text-muted)] leading-relaxed">
              This is a single-admin, private archive. There is no sign-up and no
              public accounts.
            </p>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
