/**
 * Auth: Google Sign-In (One Tap / GSI) ID token verification + session JWTs.
 *
 * - Google ID tokens are verified against Google's JWKS using `jose`
 *   (no google-auth-library — it depends on Node APIs).
 * - Session JWTs are signed with HS256 using a server secret.
 *   (EdDSA/ES256 would be nicer; HS256 keeps local dev config to one secret.
 *   Swap easily later — the signing API is identical.)
 */
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, same as before

export interface AuthEnv {
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;
}

// ---------------------------------------------------------------------------
// Google ID token verification
// ---------------------------------------------------------------------------

export interface GoogleIdentity {
  /** OAuth sub claim — stable user identifier */
  uid: string;
  email: string;
  displayName?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });

  const { sub, email, name, picture } = payload as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!sub || !email) {
    throw new Error('Google token missing sub/email claims');
  }

  return { uid: sub, email, displayName: name, picture };
}

// ---------------------------------------------------------------------------
// Session JWTs
// ---------------------------------------------------------------------------

export interface SessionClaims {
  uid: string;
  email: string;
  displayName?: string;
}

const secretCache = new Map<string, Uint8Array>();
function getSecret(secret: string): Uint8Array {
  let cached = secretCache.get(secret);
  if (!cached) {
    cached = new TextEncoder().encode(secret);
    secretCache.set(secret, cached);
  }
  return cached;
}

export async function signSessionJWT(
  claims: SessionClaims,
  secret: string,
): Promise<string> {
  return new SignJWT({ uid: claims.uid, email: claims.email, displayName: claims.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret(secret));
}

export async function verifySessionJWT(
  token: string,
  secret: string,
): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, getSecret(secret));
  const { uid, email, displayName } = payload as Record<string, unknown>;

  if (typeof uid !== 'string' || typeof email !== 'string') {
    throw new Error('Invalid session token claims');
  }

  return {
    uid,
    email,
    displayName: typeof displayName === 'string' ? displayName : undefined,
  };
}

// ---------------------------------------------------------------------------
// Hono middleware// ---------------------------------------------------------------------------

/** Attach `c.set('user', claims)` when a valid Bearer token is present. */
export function requireAuth(secret: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      return c.json({ success: false, error: 'Access token required' }, 401);
    }

    try {
      const claims = await verifySessionJWT(token, secret);
      c.set('user', claims);
      await next();
    } catch {
      return c.json({ success: false, error: 'Invalid or expired token' }, 403);
    }
  };
}

/** Like `requireAuth`, but anonymous requests pass through with no user. */
export function optionalAuth(secret: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        c.set('user', await verifySessionJWT(token, secret));
      } catch {
        // invalid token on optional routes = anonymous
      }
    }
    await next();
  };
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionClaims;
  }
}
