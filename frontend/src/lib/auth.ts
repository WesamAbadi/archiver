declare global {
  interface Window {
    google: typeof google;
  }
}

interface GoogleUser {
  credential: string;
  clientId: string;
}

interface User {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

class AuthService {
  private user: User | null = null;
  private token: string | null = null;
  private listeners: ((user: User | null) => void)[] = [];
  private initialized = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');
    
    if (storedUser && storedToken) {
      this.user = JSON.parse(storedUser);
      this.token = storedToken;
    }
  }

  private saveToStorage(user: User | null, token: string | null) {
    if (user && token) {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.user));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      // Check if Google Identity Services is already loaded
      if (window.google?.accounts?.id) {
        this.initializeGoogleAuth();
        this.initialized = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        if (!window.google?.accounts?.id) {
          reject(new Error('Google Identity Services failed to load properly'));
          return;
        }
        
        this.initializeGoogleAuth();
        this.initialized = true;
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services script'));
      };
      
      document.head.appendChild(script);
    });
  }

  private initializeGoogleAuth() {
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: this.handleCredentialResponse.bind(this),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
  }

  private async handleCredentialResponse(response: GoogleUser) {
    try {
      console.log('Received Google credential, sending to backend...');
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3003/api';
      const result = await fetch(`${apiUrl}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: response.credential }),
      });

      if (!result.ok) {
        const errorText = await result.text();
        throw new Error(`Backend error: ${result.status} - ${errorText}`);
      }

      const data = await result.json();

      if (data.success) {
        this.user = data.data.user;
        this.token = data.data.token;
        this.saveToStorage(this.user, this.token);
        this.notifyListeners();
        console.log('Authentication successful');
      } else {
        throw new Error(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  // Render Google sign-in button directly in provided element
  renderSignInButton(element: HTMLElement, options?: {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    width?: number;
  }): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.initialize();
        
        window.google.accounts.id.renderButton(element, {
          theme: options?.theme || 'filled_blue',
          size: options?.size || 'large',
          text: options?.text || 'signin_with',
          type: 'standard',
          width: options?.width || 250,
        });
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Alternative method for programmatic sign-in (if needed)
  async signInWithGoogle(): Promise<void> {
    try {
      await this.initialize();
      
      return new Promise((resolve, reject) => {
        // Try one-tap first
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // If one-tap doesn't work, reject so the UI can show the button
            reject(new Error('Please use the Google sign-in button'));
          } else if (notification.isDismissedMoment()) {
            reject(new Error('Sign-in was dismissed'));
          }
        });

        // Listen for successful authentication
        const originalHandler = this.handleCredentialResponse.bind(this);
        this.handleCredentialResponse = async (response: GoogleUser) => {
          try {
            await originalHandler(response);
            resolve();
          } catch (error) {
            reject(error);
          }
        };
      });
    } catch (error) {
      console.error('Sign-in initialization error:', error);
      throw error;
    }
  }

  signOut(): void {
    this.user = null;
    this.token = null;
    this.saveToStorage(null, null);
    this.notifyListeners();
    
    if (this.initialized && window.google) {
      window.google.accounts.id.disableAutoSelect();
    }
  }

  getCurrentUser(): User | null {
    return this.user;
  }

  getToken(): string | null {
    return this.token;
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback);
    // Immediately call with current state
    callback(this.user);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  isAuthenticated(): boolean {
    return !!this.user && !!this.token;
  }
}

export const authService = new AuthService();
export type { User }; 