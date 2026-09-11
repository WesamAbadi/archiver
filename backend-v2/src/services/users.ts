/**
 * User service — upsert on Google login + storage quota.
 *
 * Fixes carried over from the old codebase (MIGRATION_PLAN.md §3.2):
 * - ONE implementation of ensure-user (was copy-pasted 4×)
 * - Quota is a SUM query, not "load every row into JS"
 * - Quota check is called BEFORE an upload URL is issued (was checked after)
 */
import { eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { users, mediaItems } from '../db/schema';
import type { User } from '../db/schema';
import { createId } from '../lib/id';
import type { GoogleIdentity } from '../auth';

/** 1 GB, same as the old app. Make configurable via env later if needed. */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

export async function findOrCreateUser(db: DB, identity: GoogleIdentity): Promise<User> {
  const existing = await db.query.users.findFirst({ where: eq(users.uid, identity.uid) });
  if (existing) {
    // Refresh profile info from Google on each login (same behavior as before)
    const updated = await db
      .update(users)
      .set({
        displayName: identity.displayName ?? existing.displayName,
        photoURL: identity.picture ?? existing.photoURL,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    if (!updated[0]) throw new Error('Failed to update user');
    return updated[0];
  }

  // No user with this uid — check email (handles the "OAuth sub changed" case the old code handled)
  const byEmail = await db.query.users.findFirst({ where: eq(users.email, identity.email) });
  if (byEmail) {
    const updated = await db
      .update(users)
      .set({
        uid: identity.uid,
        displayName: identity.displayName ?? byEmail.displayName,
        photoURL: identity.picture ?? byEmail.photoURL,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    if (!updated[0]) throw new Error('Failed to update user');
    return updated[0];
  }

  const created = await db
    .insert(users)
    .values({
      id: createId(),
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName ?? '',
      photoURL: identity.picture,
    })
    .returning();
  if (!created[0]) throw new Error('Failed to create user');
  return created[0];
}

export async function getUserByUid(db: DB, uid: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.uid, uid) });
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
