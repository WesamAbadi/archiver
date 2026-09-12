import { useNavigate } from 'react-router-dom';
import { HardDrive, LogOut, Server, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatBytes, formatDate } from '@/lib/format';
import { API_ORIGIN } from '@/lib/env';
import { useLogout, useSession } from '@/features/auth/hooks';
import { useQuota } from '@/features/media/api';
import { toast } from '@/components/ui/toast';
import { TranscriptionSection } from './TranscriptionSettings';

export function SettingsPage() {
  const session = useSession();
  const quota = useQuota();
  const logout = useLogout();
  const navigate = useNavigate();

  const usedPercent = quota.data ? (quota.data.used / quota.data.limit) * 100 : 0;

  async function handleLogout() {
    await logout.mutateAsync();
    toast.info('Signed out.');
    navigate('/login', { replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">Settings</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Transcription, storage, session and connection details for this archive.
        </p>
      </header>

      <div className="space-y-4">
        {/* ── Storage ───────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-accent" />
            <h2 className="font-display text-lg text-ink">Storage</h2>
          </div>

          {quota.isPending ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
              <Spinner className="size-4" /> Reading usage…
            </div>
          ) : quota.isError ? (
            <p className="mt-4 text-sm text-danger">Could not read storage usage.</p>
          ) : (
            quota.data && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl text-ink">
                    {formatBytes(quota.data.used)}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    of {formatBytes(quota.data.limit)}
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={usedPercent > 90 ? 'h-full bg-danger' : 'h-full bg-accent'}
                    style={{ width: `${Math.min(100, usedPercent).toFixed(1)}%` }}
                  />
                </div>

                <p className="mt-3 text-[13px] text-ink-faint">
                  {usedPercent.toFixed(1)}% used
                  {!quota.data.hasSpace && ' — uploads are blocked until you free space'}
                </p>
              </div>
            )
          )}
        </section>

        {/* ── Transcription ─────────────────────────────────────────────── */}
        <TranscriptionSection />

        {/* ── Session ───────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <User className="size-4 text-accent" />
            <h2 className="font-display text-lg text-ink">Session</h2>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Signed in as</dt>
              <dd className="font-mono text-ink">
                {session?.user.displayName ?? session?.user.uid ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Session expires</dt>
              <dd className="font-mono text-ink">{formatDate(session?.expiresAt)}</dd>
            </div>
          </dl>

          <Button variant="danger" className="mt-5" onClick={handleLogout} loading={logout.isPending}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </section>

        {/* ── Connection ────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-accent" />
            <h2 className="font-display text-lg text-ink">Connection</h2>
          </div>

          <p className="mt-4 text-[13px] text-ink-muted">
            API origin
            <span className="ml-2 font-mono text-ink">
              {API_ORIGIN || '(same origin — dev proxy)'}
            </span>
          </p>
          <p className="mt-2 text-[13px] text-ink-faint">
            Media is served directly from object storage with short-lived signed URLs.
          </p>
        </section>
      </div>
    </div>
  );
}
