/**
 * Auth routes — single-admin login.
 *
 * POST /auth/login   username + password -> session token
 * POST /auth/logout  revoke the presented token (idempotent)
 * GET  /auth/me      validate a stored token on app boot
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import {
  hashSessionToken,
  requireAuth,
  startAdminSession,
  verifyAdminCredentials,
} from '../auth';
import {
  advanceOnFailure,
  clearOnSuccess,
  evaluateLoginAttempt,
  throttleStateOf,
} from '../auth/throttle';
import { deleteSession } from '../services/sessions';
import { getAdminUser, saveLoginThrottle } from '../services/users';

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
  // 1. Edge rate limit, before anything touches the database.
  //
  // Keyed on the client IP because that is the only identifier a login request
  // carries — there is no user to key on, and the submitted username is
  // attacker-controlled. `cf-connecting-ip` is set by Cloudflare and cannot be
  // forged by the client (it is simply absent in local dev, where we skip).
  //
  // Remember these counters are per Cloudflare location; the database-backed
  // lock below is what makes the limit global.
  const limiter = c.env.LOGIN_RATE_LIMITER;
  const ip = c.req.header('cf-connecting-ip');
  if (limiter && ip) {
    const { success } = await limiter.limit({ key: `login:${ip}` });
    if (!success) {
      c.header('Retry-After', '60');
      return c.json({ success: false, error: 'Too many login attempts. Try again shortly.' }, 429);
    }
  }

  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Username and password are required' }, 400);
  }

  // Fail loudly rather than treating "no password configured" as "no auth".
  if (!c.env.ADMIN_PASSWORD) {
    console.error('[auth] ADMIN_PASSWORD is not configured — refusing login');
    return c.json({ success: false, error: 'Admin login is not configured' }, 503);
  }

  const db = c.get('db');

  // 2. Global lock, held on the admin row. Checked before the credential
  // comparison so a locked account costs an attacker nothing but a 429 — and
  // so we never burn CPU hashing guesses for an account we won't unlock.
  const admin = await getAdminUser(db);
  const now = new Date();
  const gate = evaluateLoginAttempt(throttleStateOf(admin), now);
  if (!gate.allowed) {
    c.header('Retry-After', String(gate.retryAfterSeconds));
    return c.json(
      { success: false, error: 'Too many failed attempts. Try again later.' },
      429,
    );
  }

  const valid = await verifyAdminCredentials(parsed.data.username, parsed.data.password, c.env);
  if (!valid) {
    // Count the failure against the single admin row — a wrong username is
    // still a guess at this login, so it counts too.
    if (admin) {
      await saveLoginThrottle(db, admin.id, advanceOnFailure(throttleStateOf(admin), now));
    }
    // Deliberately vague — never reveal which half was wrong.
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  // Only write when there is something to clear, so a quiet login is read-only.
  if (admin && (admin.failedLoginAttempts > 0 || admin.lockedUntil)) {
    await saveLoginThrottle(db, admin.id, clearOnSuccess());
  }

  const session = await startAdminSession(db, c.env);

  return c.json({
    success: true,
    data: {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: session.user.id,
        uid: session.user.uid,
        displayName: session.user.displayName,
        email: session.user.email,
      },
    },
  });
});

// No auth middleware on purpose: logging out with an already-dead token should
// still succeed (idempotent), and the only effect is deleting that session.
authRoutes.post('/logout', async (c) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (token) {
    await deleteSession(c.get('db'), await hashSessionToken(token));
  }

  return c.json({ success: true, message: 'Logged out' });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const admin = c.get('admin');
  return c.json({
    success: true,
    data: {
      user: {
        id: admin.id,
        uid: admin.uid,
        displayName: admin.displayName,
        email: admin.email,
      },
    },
  });
});
