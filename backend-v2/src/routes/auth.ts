/**
 * Auth routes.
 *
 * POST /auth/google — exchange a Google ID token (from GIS/One Tap on the
 * frontend) for an ArchiveDrop session JWT. Finds-or-creates the user.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { verifyGoogleIdToken, signSessionJWT } from '../auth';
import { findOrCreateUser } from '../services/users';

const googleLoginSchema = z.object({
  token: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/google', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = googleLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Google token is required' }, 400);
  }

  try {
    const identity = await verifyGoogleIdToken(parsed.data.token, c.env.GOOGLE_CLIENT_ID);
    const db = c.get('db');
    const user = await findOrCreateUser(db, identity);

    const token = await signSessionJWT(
      { uid: user.uid, email: user.email, displayName: user.displayName ?? undefined },
      c.env.JWT_SECRET,
    );

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
        token,
      },
    });
  } catch (err) {
    // Never echo provider errors verbatim to the client
    console.error('Google auth failed:', err);
    return c.json({ success: false, error: 'Authentication failed' }, 401);
  }
});
