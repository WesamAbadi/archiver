import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from './hooks';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Route guard.
 *
 * Renders a spinner while the session store is read (it's synchronous, so this
 * is really about not flashing a redirect before React hydrates) and remembers
 * where the user was headed, so signing in returns them there instead of
 * dumping them on the library.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

/** Prevents the login page from rendering when already signed in. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session) return <Navigate to="/library" replace />;

  return <>{children}</>;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-6 text-accent" label="Loading" />
    </div>
  );
}
