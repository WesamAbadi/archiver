/**
 * User service — the single admin owner + storage quota.
 *
 * There are no accounts: `users` holds exactly ONE row so that media and
 * caption jobs keep an owner (`user_id` FK) and quota stays per-owner. Nothing
 * here creates profiles; `ensureAdminUser` is idempotent and only ever touches
 * that one row.
 *
 * Fixes carried over from the old codebase (MIGRATION_PLAN.md §3.2):
 * - Quota is a SUM query, not "load every row into JS"
 * - Quota check is called BEFORE an upload URL is issued (was checked after)
 */
import { eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { users, mediaItems } from '../db/schema';
import type { User } from '../db/schema';
import { createId } from '../lib/id';

/** 1 GB, same as the old app. Make configurable via env later if needed. */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

/** The admin owner row (there is only ever one). */
export async function getAdminUser(db: DB): Promise<User | undefined> {
  const rows = await db.select().from(users).limit(1);
  return rows[0];
}

export async function getUserById(db: DB, id: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

/**
 * Return the admin row, creating it on first login and keeping its login
 * identity in sync if ADMIN_USERNAME changes.
 */
export async function ensureAdminUser(db: DB, username: string): Promise<User> {
  const existing = await getAdminUser(db);

  if (existing) {
    if (existing.uid === username) return existing;

    const updated = await db
      .update(users)
      .set({ uid: username, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();
    if (!updated[0]) throw new Error('Failed to update admin user');
    return updated[0];
  }

  const inserted = await db.insert(users).values({ id: createId(), uid: username }).returning();
  if (!inserted[0]) throw new Error('Failed to create admin user');
  return inserted[0];
}

/**
 * Persist login-throttle state (see src/auth/throttle.ts for the policy).
 *
 * Structural type on purpose — the deciding logic lives in `auth/throttle.ts`,
 * which stays free of database imports so it can be unit-tested alone.
 */
export async function saveLoginThrottle(
  db: DB,
  userId: string,
  state: { failedAttempts: number; lockedUntil: Date | null },
): Promise<void> {
  await db
    .update(users)
    .set({
      failedLoginAttempts: state.failedAttempts,
      lockedUntil: state.lockedUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export interface QuotaInfo {
  used: number;
  limit: number;
  hasSpace: boolean;
}

/** Storage usage via SQL SUM — O(1) rows transferred, unlike the old reduce-over-all-rows. */
export async function getStorageQuota(db: DB, userId: string): Promise<QuotaInfo> {
  const [row] = await db
    .select({ used: sql<number>`COALESCE(SUM(${mediaItems.size}), 0)::bigint` })
    .from(mediaItems)
    .where(eq(mediaItems.userId, userId));

  const used = Number(row?.used ?? 0);
  return {
    used,
    limit: STORAGE_LIMIT_BYTES,
    hasSpace: used < STORAGE_LIMIT_BYTES,
  };
}
