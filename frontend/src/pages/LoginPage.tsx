import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authService } from '../lib/auth'
import { Zap, Lock, Mail, User as UserIcon, ArrowRight, Youtube, Music2, Twitter, Sparkles, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageContainer, Card } from '../components/common'

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
      await authService.signInWithGoogle()
      toast.success('Welcome to ArchiveDrop!')
      navigate('/dashboard')
    } catch (error: any) {
      console.error('Login error:', error)
      if (!error.message.includes('Please use the Google sign-in button')) {
        toast.error('Failed to sign in. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageContainer variant="default" className="flex items-center justify-center min-h-screen relative overflow-hidden">
      {/* Enhanced Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Main gradient backgrounds */}
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-r from-[var(--accent-blue)]/30 to-[var(--accent-purple)]/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-r from-[var(--accent-purple)]/30 to-[var(--accent-green)]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        
        {/* Additional floating elements */}
        <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-[var(--accent-orange)]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
        <div className="absolute bottom-1/3 left-1/4 w-24 h-24 bg-[var(--accent-green)]/15 rounded-full blur-xl animate-pulse delay-2000"></div>
        
        {/* Central radial gradient */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(var(--accent-blue-rgb),0.1),transparent_50%)]"></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-4">
        <Card variant="gaming" className="p-6 md:p-8 backdrop-blur-xl bg-[var(--bg-card)]/95 border-2">
          {/* Enhanced Logo & Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-4 mb-8">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] rounded-3xl blur-lg opacity-75"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] rounded-3xl flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform duration-300">
                  <Zap className="w-9 h-9 text-white drop-shadow-lg" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[var(--text-primary)] via-[var(--accent-blue)] to-[var(--accent-purple)] bg-clip-text text-transparent">
                  ArchiveDrop
                </h1>
                <div className="flex items-center justify-center space-x-1 mt-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 text-[var(--accent-orange)] fill-current" />
                  ))}
                  <span className="text-xs text-[var(--text-muted)] ml-2">Trusted by creators</span>
                </div>
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] mb-3">
              Welcome Back
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              Sign in to access your digital vault
            </p>
          </div>

          {/* Login Methods */}
          <div className="space-y-8">
            {/* Google Login Button */}
            <div className="flex justify-center">
              <div 
                ref={googleButtonRef} 
                className="w-full max-w-xs transform hover:scale-105 transition-transform duration-200"
              ></div>
            </div>

            {/* Enhanced Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gradient-to-r from-transparent via-[var(--border-primary)] to-transparent"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-6 py-2 bg-[var(--bg-card)] text-[var(--text-muted)] rounded-full border border-[var(--border-primary)]">
                  Quick Start
                </span>
              </div>
            </div>

            {/* Enhanced Guest Option */}
            <div className="space-y-6">
              <Link
                to="/"
                className="w-full group relative overflow-hidden bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-hover)] hover:from-[var(--bg-hover)] hover:to-[var(--accent-blue)]/10 border border-[var(--border-primary)] hover:border-[var(--accent-blue)]/30 rounded-xl p-4 flex items-center justify-center transition-all duration-300 transform hover:scale-[1.02]"
              >
                <UserIcon className="w-5 h-5 mr-3 text-[var(--text-secondary)] group-hover:text-[var(--accent-blue)] transition-colors" />
                <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">Browse as Guest</span>
                <ArrowRight className="w-5 h-5 ml-3 transform group-hover:translate-x-1 transition-transform text-[var(--text-muted)] group-hover:text-[var(--accent-blue)]" />
              </Link>
              
              <p className="text-sm text-center text-[var(--text-muted)] leading-relaxed">
                New to ArchiveDrop? Click the Google button above to get started!<br />
                <span className="text-[var(--accent-green)]">✨ Free account • No credit card required</span>
              </p>
            </div>
          </div>

          {/* Enhanced Features Preview */}
          <div className="mt-10 pt-8 border-t border-[var(--border-primary)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6 text-center">
              What you can do with ArchiveDrop
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Card variant="hover" className="p-4 bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-blue)]/5 border-[var(--accent-blue)]/20 group hover:scale-105 transition-transform duration-200">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[var(--accent-blue)]/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Youtube className="w-4 h-4 text-[var(--accent-blue)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">YouTube Archive</span>
                </div>
              </Card>
              
              <Card variant="hover" className="p-4 bg-gradient-to-br from-[var(--accent-orange)]/10 to-[var(--accent-orange)]/5 border-[var(--accent-orange)]/20 group hover:scale-105 transition-transform duration-200">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[var(--accent-orange)]/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Music2 className="w-4 h-4 text-[var(--accent-orange)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Audio Backup</span>
                </div>
              </Card>
              
              <Card variant="hover" className="p-4 bg-gradient-to-br from-[var(--accent-purple)]/10 to-[var(--accent-purple)]/5 border-[var(--accent-purple)]/20 group hover:scale-105 transition-transform duration-200">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[var(--accent-purple)]/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Twitter className="w-4 h-4 text-[var(--accent-purple)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Social Media</span>
                </div>
              </Card>
              
              <Card variant="hover" className="p-4 bg-gradient-to-br from-[var(--accent-green)]/10 to-[var(--accent-green)]/5 border-[var(--accent-green)]/20 group hover:scale-105 transition-transform duration-200">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[var(--accent-green)]/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles className="w-4 h-4 text-[var(--accent-green)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">AI Metadata</span>
                </div>
              </Card>
            </div>
          </div>

          {/* Enhanced Security Notice */}
          <Card variant="hover" className="mt-8 p-5 bg-gradient-to-r from-[var(--accent-green)]/10 to-[var(--accent-blue)]/5 border-[var(--accent-green)]/20">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[var(--accent-green)] to-[var(--accent-blue)] flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-[var(--accent-green)] mb-1">
                  Bank-Level Security
                </h4>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  Your data is protected with Google's enterprise-grade security infrastructure. 
                  We never store your passwords or access your Google account data.
                </p>
              </div>
            </div>
          </Card>
        </Card>

        {/* Enhanced Footer */}
        <div className="text-center mt-8 space-y-4">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            By signing in, you agree to our{' '}
            <a href="#" className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)]/80 underline underline-offset-2 transition-colors">
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="#" className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)]/80 underline underline-offset-2 transition-colors">
              Privacy Policy
            </a>
          </p>
          
          <div className="flex items-center justify-center space-x-4 text-xs text-[var(--text-muted)]">
            <span>🔒 SSL Encrypted</span>
            <span>•</span>
            <span>📱 Mobile Friendly</span>
            <span>•</span>
            <span>⚡ Lightning Fast</span>
          </div>
        </div>
      </div>
    </PageContainer>
  )
} 