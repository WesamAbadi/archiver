/**
 * Admin sessions — opaque bearer tokens backed by Postgres.
 *
 * Why not JWTs: there is exactly one admin, so a server-side session gives us
 * revocation (log out everywhere instantly), real expiry, and no signing secret
 * to manage. The cost is one indexed lookup per authenticated request — cheap
 * next to the D1/Postgres round trip the request is already making.
 *
 * Only the SHA-256 of the token is stored, so a database leak does not hand an
 * attacker usable session tokens (same reasoning as password hashing).
 */
import { and, eq, gt, lt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { adminSessions } from '../db/schema';

export async function createSession(
  db: DB,
  tokenHash: string,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  await db.insert(adminSessions).values({ tokenHash, userId, expiresAt });
}

export interface SessionOwner {
  userId: string;
}

/**
 * Validate a token and touch its `last_used_at` in one atomic statement.
 *
 * Expiry is enforced in the WHERE clause rather than in JS so an expired
 * session can never be accepted because of clock drift or a stale read.
 */
export async function findSession(db: DB, tokenHash: string): Promise<SessionOwner | undefined> {
  const rows = await db
    .update(adminSessions)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, new Date())))
    .returning({ userId: adminSessions.userId });

  return rows[0];
}

/** Log out a single session. Returns true when a session was actually removed. */
export async function deleteSession(db: DB, tokenHash: string): Promise<boolean> {
  const deleted = await db
    .delete(adminSessions)
    .where(eq(adminSessions.tokenHash, tokenHash))
    .returning({ tokenHash: adminSessions.tokenHash });

  return deleted.length > 0;
}

/** Housekeeping for the cron sweep — expired rows are useless anyway. */
export async function deleteExpiredSessions(db: DB): Promise<number> {
  const deleted = await db
    .delete(adminSessions)
    .where(lt(adminSessions.expiresAt, new Date()))
    .returning({ tokenHash: adminSessions.tokenHash });

  return deleted.length;
}
