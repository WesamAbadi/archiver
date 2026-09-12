/**
 * Login throttling policy — pure, so the escalation rules are testable without
 * a database or a Worker.
 *
 * The threat is unlimited password guesses against a single, known username.
 * Two layers sit in front of `verifyAdminCredentials`:
 *
 *   1. A Cloudflare rate-limit binding keyed on client IP (see routes/auth.ts).
 *      Cheap and it never reaches Postgres — but the counters are **per
 *      Cloudflare location**, so a source spread across locations gets roughly
 *      `locations × limit` attempts per window.
 *
 *   2. The state below, held on the single admin row. It is *global* — one
 *      counter regardless of how many IPs the attempts arrive from — which is
 *      what actually bounds guessing.
 *
 * Trade-off worth naming: a global lock is also a denial-of-service lever, since
 * anyone can lock the owner out by failing repeatedly. The lock is deliberately
 * short and self-clearing (a successful login always resets it), and the worst
 * outcome is that the owner waits — it never exposes anything.
 */

/** Failures allowed before the account locks. */
export const MAX_FAILED_ATTEMPTS = 8;

/** How long a lock lasts — short enough that a false lock is a wait, not an outage. */
export const LOCKOUT_SECONDS = 15 * 60;

export interface ThrottleState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export type LoginGate = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Read the stored state off the admin row (absent before the very first login). */
export function throttleStateOf(
  row: { failedLoginAttempts: number; lockedUntil: Date | null } | undefined,
): ThrottleState {
  return row ? { failedAttempts: row.failedLoginAttempts, lockedUntil: row.lockedUntil } : clean();
}

/** May this request proceed to the credential check? */
export function evaluateLoginAttempt(state: ThrottleState | undefined, now: Date): LoginGate {
  const lockedUntil = state?.lockedUntil;
  if (!lockedUntil) return { allowed: true };

  const remainingMs = lockedUntil.getTime() - now.getTime();
  if (remainingMs <= 0) return { allowed: true }; // lock has expired

  return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

/**
 * State after a failed attempt.
 *
 * Hitting the threshold locks the account and zeroes the counter, so the next
 * window starts clean instead of re-locking on the very next typo.
 */
export function advanceOnFailure(state: ThrottleState | undefined, now: Date): ThrottleState {
  const current = dropExpiredLock(state, now);
  if (current.lockedUntil) return current; // already locked — never extended

  const failedAttempts = current.failedAttempts + 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_SECONDS * 1000) };
  }
  return { failedAttempts, lockedUntil: null };
}

/** A successful login clears both the count and any lock. */
export function clearOnSuccess(): ThrottleState {
  return { failedAttempts: 0, lockedUntil: null };
}

/** Fresh state. A new object every time, so no two callers can share one. */
function clean(): ThrottleState {
  return { failedAttempts: 0, lockedUntil: null };
}

/** An expired lock also discards the count that produced it. */
function dropExpiredLock(state: ThrottleState | undefined, now: Date): ThrottleState {
  if (!state) return clean();
  if (!state.lockedUntil) return state;
  return state.lockedUntil.getTime() > now.getTime() ? state : clean();
}
