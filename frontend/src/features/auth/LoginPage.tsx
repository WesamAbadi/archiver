import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api';
import { useLogin } from './hooks';

/**
 * Admin sign-in.
 *
 * Username + password against the API; the server returns an opaque session
 * token. There is no sign-up, no OAuth and no password reset — this is a
 * single-owner archive, so the form stays a form.
 */
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? '/library';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    try {
      await login.mutateAsync({ username: username.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 503) {
          setError(
            'Admin login is not configured yet. Set the ADMIN_PASSWORD secret on the API and try again.',
          );
          return;
        }
        if (err.status === 401) {
          setError('Incorrect username or password.');
          return;
        }
        setError(err.message);
        return;
      }
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">ArchiveDrop</p>
          <h1 className="mt-3 font-display text-3xl text-ink">Private archive</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Sign in to manage the collection.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-surface p-6 shadow-[var(--shadow-lift)]"
          noValidate
        >
          <div className="space-y-4">
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leading={<User className="size-4" />}
              placeholder="admin"
              disabled={login.isPending}
            />

            <TextField
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leading={<Lock className="size-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="rounded-xs p-2 text-ink-faint transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
              disabled={login.isPending}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] text-danger">
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={login.isPending}
            className="mt-6 w-full"
          >
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-ink-faint">
          Single-owner archive. There are no user accounts.
        </p>
      </div>
    </main>
  );
}
