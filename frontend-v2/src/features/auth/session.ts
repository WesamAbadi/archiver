import type { AdminUser } from '@/lib/types';

/**
 * Session store — the single source of truth for "who is signed in".
 *
 * Deliberately a tiny external store rather than a React context: the API
 * client also needs the token (and needs to clear the session on a 401), and
 * threading that through context would make the client depend on the tree.
 *
 * The snapshot object is only replaced on real changes, which is what
 * `useSyncExternalStore` requires to avoid render loops.
 */

const TOKEN_KEY = 'archivedrop:token';
const USER_KEY = 'archivedrop:user';
const EXPIRES_KEY = 'archivedrop:expires';

export interface Session {
  token: string;
  user: AdminUser;
  /** ISO timestamp from the API; null when unknown. */
  expiresAt: string | null;
}

export type SessionSnapshot = Session | null;

const listeners = new Set<() => void>();

function readStoredSession(): SessionSnapshot {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    if (!token || !rawUser) return null;

    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    // A session we already know is expired is treated as signed out, so the app
    // never renders a signed-in shell on top of a dead token.
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;

    const user = JSON.parse(rawUser) as AdminUser;
    if (!user || typeof user.id !== 'string') return null;

    return { token, user, expiresAt };
  } catch {
    return null;
  }
}

let snapshot: SessionSnapshot = readStoredSession();

function persist(session: SessionSnapshot): void {
  try {
    if (session) {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
      if (session.expiresAt) localStorage.setItem(EXPIRES_KEY, session.expiresAt);
      else localStorage.removeItem(EXPIRES_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EXPIRES_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode). The in-memory session still works.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getSession(): SessionSnapshot {
  return snapshot;
}

export function getToken(): string | null {
  return snapshot?.token ?? null;
}

export function setSession(session: Session): void {
  snapshot = session;
  persist(snapshot);
  emit();
}

export function clearSession(): void {
  if (snapshot === null) return;
  snapshot = null;
  persist(null);
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
