/**
 * Auth — single-admin login with opaque, server-side sessions.
 *
 * No Google, no JWT, no accounts: one admin (ADMIN_USERNAME/ADMIN_PASSWORD)
 * logs in once and receives a random 256-bit token. The token's SHA-256 is
 * stored in `admin_sessions` (see services/sessions.ts), so sessions expire
 * and can be revoked — neither of which the old JWT flow could do.
 */
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { AppEnv } from '../env';
import type { User } from '../db/schema';
import { createSession, findSession } from '../services/sessions';
import { ensureAdminUser, getUserById } from '../services/users';

export interface AuthEnv {
  /** Username for the single admin account. Defaults to `admin`. */
  ADMIN_USERNAME?: string;
  /** Password secret. Required — login is refused while unset. */
  ADMIN_PASSWORD?: string;
}

export const DEFAULT_ADMIN_USERNAME = 'admin';

/** 7 days, same lifetime the old session JWTs had. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Credential check
// ---------------------------------------------------------------------------

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fixed-length compare with no early exit (no length or prefix timing leak). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/**
 * Compare submitted credentials against the configured admin ones.
 * Both fields are hashed first so they're always compared as 32 fixed bytes,
 * and both comparisons always run (no short-circuit on a wrong username).
 */
export async function verifyAdminCredentials(
  username: string,
  password: string,
  env: AuthEnv,
): Promise<boolean> {
  // Unconfigured password = login disabled, never "any password works".
  if (!env.ADMIN_PASSWORD) return false;

  const expectedUsername = env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const [gotUser, wantUser, gotPass, wantPass] = await Promise.all([
    sha256Bytes(username),
    sha256Bytes(expectedUsername),
    sha256Bytes(password),
    sha256Bytes(env.ADMIN_PASSWORD),
  ]);

  const usernameOk = constantTimeEqual(gotUser, wantUser);
  const passwordOk = constantTimeEqual(gotPass, wantPass);
  return usernameOk && passwordOk;
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

/** 32 random bytes, hex-encoded. Handed to the client exactly once. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** What we store — the raw token never touches the database. */
export async function hashSessionToken(token: string): Promise<string> {
  return hex(await sha256Bytes(token));
}

export interface StartedSession {
  token: string;
  user: User;
  expiresAt: Date;
}

/** Log the admin in: ensure the owner row exists, then open a session. */
export async function startAdminSession(db: DBLike, env: AuthEnv): Promise<StartedSession> {
  const username = env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const user = await ensureAdminUser(db, username);

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await createSession(db, await hashSessionToken(token), user.id, expiresAt);

  return { token, user, expiresAt };
}

/** Structural alias so this module doesn't need to import the driver types. */
type DBLike = Parameters<typeof ensureAdminUser>[0];

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Require a valid session. Attaches the admin row as `c.get('admin')` so route
 * handlers never have to re-resolve the owner (the old code looked the user up
 * separately in every handler, twice per request in some cases).
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  try {
    const db = c.get('db');
    const session = await findSession(db, await hashSessionToken(token));
    if (!session) {
      return c.json({ success: false, error: 'Invalid or expired session' }, 401);
    }

    const admin = await getUserById(db, session.userId);
    if (!admin) {
      return c.json({ success: false, error: 'Invalid or expired session' }, 401);
    }

    c.set('admin', admin);
    await next();
  } catch (err) {
    console.error('[auth] session check failed:', err);
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
});

/**
 * Identify the admin when a valid session is presented, but never block.
 *
 * Read routes use this instead of `requireAuth` because the archive is public:
 * a visitor gets the content, and a signed-in admin additionally gets the
 * management detail (transcript error text, active job state, the quota) that
 * is either noise or internal to everyone else. So the *content* has one code
 * path, and the audience only changes how much of the response is filled in.
 */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) return next();

  try {
    const db = c.get('db');
    const session = await findSession(db, await hashSessionToken(token));
    if (session) {
      const admin = await getUserById(db, session.userId);
      if (admin) c.set('admin', admin);
    }
  } catch (err) {
    // A *public read* must not fail because an optional credential could not be
    // checked. Fall through as anonymous rather than turning this into a 401/500.
    console.error('[auth] optional session check failed:', err);
  }

  return next();
});

/**
 * The signed-in admin, or `undefined` on a public request.
 *
 * `requireAuth` guarantees the value, so `c.get('admin')` is typed as non-null
 * for those handlers. Public reads have to say otherwise, and one documented
 * accessor is better than a cast repeated in every read route.
 */
export function getAdmin(c: Context<AppEnv>): User | undefined {
  return c.get('admin') as User | undefined;
}

declare module 'hono' {
  interface ContextVariableMap {
    admin: User;
  }
}
