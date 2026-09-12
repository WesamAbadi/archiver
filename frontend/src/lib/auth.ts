/**
 * Auth service — single-admin login.
 *
 * No Google, no OAuth, no accounts. The app posts a username + password to
 * POST /api/auth/login and stores the opaque session token that comes back.
 * The API validates that token on every request; it expires server-side after
 * 7 days and can be revoked with POST /api/auth/logout.
 */

import { API_BASE_URL } from './apiBase'

export interface User {
  id: string
  uid: string
  email?: string | null
  displayName?: string | null
  /**
   * @deprecated No longer returned by the API (the admin has no profile).
   * Keep as an optional field until the UI stops reading it in Phase 4.
   */
  photoURL?: string | null
}

interface LoginResponse {
  success: boolean
  data?: { token: string; expiresAt: string; user: User }
  error?: string
}

const STORAGE_USER = 'user'
const STORAGE_TOKEN = 'token'

class AuthService {
  private user: User | null = null
  private token: string | null = null;
  private listeners: ((user: User | null) => void)[] = []

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const storedUser = localStorage.getItem(STORAGE_USER)
      const storedToken = localStorage.getItem(STORAGE_TOKEN)
      if (storedUser && storedToken) {
        this.user = JSON.parse(storedUser)
        this.token = storedToken
      }
    } catch {
      // Corrupt storage shouldn't brick the app — treat it as logged out.
      this.saveToStorage(null, null)
    }
  }

  private saveToStorage(user: User | null, token: string | null) {
    if (user && token) {
      localStorage.setItem(STORAGE_USER, JSON.stringify(user))
      localStorage.setItem(STORAGE_TOKEN, token)
    } else {
      localStorage.removeItem(STORAGE_USER)
      localStorage.removeItem(STORAGE_TOKEN)
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.user))
  }

  /** Exchange admin credentials for a session token. */
  async login(username: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    const data: LoginResponse = await res
      .json()
      .catch(() => ({ success: false, error: 'Unexpected server response' }))

    if (!res.ok || !data.success || !data.data) {
      throw new Error(data.error || `Login failed (${res.status})`)
    }

    this.user = data.data.user
    this.token = data.data.token
    this.saveToStorage(this.user, this.token)
    this.notifyListeners()

    return this.user
  }

  /**
   * Confirm a stored token is still valid (called once on app boot).
   * A network failure keeps the session — only an explicit rejection clears it.
   */
  async verifySession(): Promise<boolean> {
    if (!this.token) return false

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      })

      if (!res.ok) {
        this.signOut()
        return false
      }

      const data = await res.json().catch(() => null)
      if (data?.data?.user) {
        this.user = data.data.user
        this.saveToStorage(this.user, this.token)
        this.notifyListeners()
      }
      return true
    } catch {
      return false
    }
  }

  /** Revoke the session server-side, then clear local state. */
  async logout(): Promise<void> {
    if (this.token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        })
      } catch {
        // Best effort — a failed revoke must never block logging out locally.
      }
    }

    this.signOut()
  }

  /** Clear local state only (used by the 401 interceptor and logout). */
  signOut(): void {
    this.user = null
    this.token = null
    this.saveToStorage(null, null)
    this.notifyListeners()
  }

  getCurrentUser(): User | null {
    return this.user
  }

  getToken(): string | null {
    return this.token
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback)
    // Immediately report the current state
    callback(this.user)

    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback)
    }
  }

  isAuthenticated(): boolean {
    return !!this.user && !!this.token
  }
}

export const authService = new AuthService()
