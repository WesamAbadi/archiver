import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authService } from '../lib/auth'
import { Loader2, Zap, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()
  const googleButtonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    // Render Google sign-in button when component mounts
    if (googleButtonRef.current && !user) {
      authService.renderSignInButton(googleButtonRef.current, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        width: 280
      }).catch(error => {
        console.error('Failed to render Google button:', error);
        toast.error('Failed to load Google sign-in');
      });
    }
  }, [user]);

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      // Try one-tap sign-in first, but if it fails, the button will handle it
      await authService.signInWithGoogle()
      toast.success('Welcome to ArchiveDrop!')
      navigate('/dashboard')
    } catch (error: any) {
      console.error('Login error:', error)
      // Don't show error for "Please use the Google sign-in button" - that's expected
      if (!error.message.includes('Please use the Google sign-in button')) {
        toast.error('Failed to sign in. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-blue)]/5 via-[var(--accent-purple)]/5 to-[var(--accent-green)]/5"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--accent-blue)]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--accent-purple)]/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <div className="card-gaming p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-12 h-12 bg-gradient-gaming rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gradient">ArchiveDrop</h1>
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Welcome Back
            </h2>
            <p className="text-[var(--text-secondary)]">
              Sign in to access your digital vault
            </p>
          </div>

          {/* Login Methods */}
          <div className="space-y-4">
            {/* Google Login Button Container */}
            <div className="flex justify-center">
              <div ref={googleButtonRef} className="w-full max-w-xs"></div>
            </div>

            {/* Fallback Button (if Google button fails to load) */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full btn btn-primary group relative overflow-hidden"
              style={{ display: 'none' }} // Hidden by default, can be shown if needed
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative flex items-center justify-center space-x-3">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border-primary)]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[var(--bg-card)] text-[var(--text-muted)]">
                  Quick Start
                </span>
              </div>
            </div>

            {/* Guest Options */}
            <div className="space-y-3">
              <Link
                to="/"
                className="w-full btn btn-secondary group"
              >
                <UserIcon className="w-4 h-4 mr-2" />
                Browse as Guest
              </Link>
              
              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  New to ArchiveDrop? Click the Google button above to get started!
                </p>
              </div>
            </div>
          </div>

          {/* Features Preview */}
          <div className="mt-8 pt-6 border-t border-[var(--border-primary)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 text-center">
              What you can do with ArchiveDrop
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[var(--accent-blue)] rounded-full"></div>
                <span className="text-[var(--text-secondary)]">Archive from YouTube</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[var(--accent-orange)] rounded-full"></div>
                <span className="text-[var(--text-secondary)]">Save SoundCloud tracks</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[var(--accent-purple)] rounded-full"></div>
                <span className="text-[var(--text-secondary)]">Twitter media backup</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[var(--accent-green)] rounded-full"></div>
                <span className="text-[var(--text-secondary)]">AI-powered metadata</span>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="mt-6 p-3 bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-[var(--accent-green)]" />
              <span className="text-sm text-[var(--accent-green)]">
                Secure authentication with Google
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-[var(--text-muted)]">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
} 