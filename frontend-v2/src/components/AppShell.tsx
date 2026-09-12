import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { HardDrive, Library, LogOut, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useLogout } from '@/features/auth/hooks';
import { useQuota } from '@/features/media/api';

const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: Library },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

/**
 * App shell — header + routed content.
 *
 * Uses `<Outlet />` so navigation doesn't remount the header (and its quota
 * query) on every route change.
 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 px-6 py-4">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          ArchiveDrop · private collection
        </p>
      </footer>
    </div>
  );
}

function Header() {
  const logout = useLogout();
  const quota = useQuota();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <NavLink to="/library" className="flex items-baseline gap-2">
          <span className="font-display text-lg text-ink">ArchiveDrop</span>
        </NavLink>

        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-surface-2 text-ink'
                    : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink',
                )
              }
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {quota.data && (
            <div className="hidden items-center gap-2 md:flex" title="Storage used">
              <HardDrive className="size-4 text-ink-faint" />
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    quota.data.used / quota.data.limit > 0.9 ? 'bg-danger' : 'bg-accent',
                  )}
                  style={{
                    width: `${Math.min(100, (quota.data.used / quota.data.limit) * 100).toFixed(1)}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[11px] text-ink-faint">
                {formatBytes(quota.data.used)}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
