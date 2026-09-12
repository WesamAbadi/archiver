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
import { deleteSession } from '../services/sessions';

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
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

  const valid = await verifyAdminCredentials(parsed.data.username, parsed.data.password, c.env);
  if (!valid) {
    // Deliberately vague — never reveal which half was wrong.
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  const session = await startAdminSession(c.get('db'), c.env);

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
