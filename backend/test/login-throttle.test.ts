import { describe, it, expect } from 'vitest';
import {
  advanceOnFailure,
  clearOnSuccess,
  evaluateLoginAttempt,
  throttleStateOf,
  LOCKOUT_SECONDS,
  MAX_FAILED_ATTEMPTS,
  type ThrottleState,
} from '../src/auth/throttle';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const inSeconds = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const clean: ThrottleState = { failedAttempts: 0, lockedUntil: null };

describe('evaluateLoginAttempt', () => {
  it('allows a login when there is no admin row yet (first ever login)', () => {
    expect(evaluateLoginAttempt(undefined, NOW)).toEqual({ allowed: true });
  });

  it('allows a login when nothing has failed', () => {
    expect(evaluateLoginAttempt(clean, NOW)).toEqual({ allowed: true });
  });

  it('allows a login while attempts are still under the threshold', () => {
    const state = { failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null };
    expect(evaluateLoginAttempt(state, NOW)).toEqual({ allowed: true });
  });

  it('refuses a login while locked, reporting the remaining wait', () => {
    const state = { failedAttempts: 0, lockedUntil: inSeconds(600) };
    expect(evaluateLoginAttempt(state, NOW)).toEqual({ allowed: false, retryAfterSeconds: 600 });
  });

  it('rounds the remaining wait up, so Retry-After is never early', () => {
    const state = { failedAttempts: 0, lockedUntil: new Date(NOW.getTime() + 1500) };
    expect(evaluateLoginAttempt(state, NOW)).toEqual({ allowed: false, retryAfterSeconds: 2 });
  });

  it('allows a login the moment the lock expires', () => {
    expect(evaluateLoginAttempt({ failedAttempts: 0, lockedUntil: NOW }, NOW)).toEqual({
      allowed: true,
    });
  });

  it('allows a login when the lock is in the past', () => {
    const state = { failedAttempts: 0, lockedUntil: inSeconds(-1) };
    expect(evaluateLoginAttempt(state, NOW)).toEqual({ allowed: true });
  });

  it('never reports a negative or zero wait while refusing', () => {
    const gate = evaluateLoginAttempt({ failedAttempts: 0, lockedUntil: inSeconds(1) }, NOW);
    expect(gate).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });
});

describe('advanceOnFailure', () => {
  it('counts the first failure without locking', () => {
    expect(advanceOnFailure(undefined, NOW)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it('increments an existing count', () => {
    const state = { failedAttempts: 3, lockedUntil: null };
    expect(advanceOnFailure(state, NOW)).toEqual({ failedAttempts: 4, lockedUntil: null });
  });

  it('locks the account once the threshold is reached', () => {
    const state = { failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null };
    const next = advanceOnFailure(state, NOW);

    expect(next.lockedUntil).toEqual(inSeconds(LOCKOUT_SECONDS));
    // Counter resets with the lock, so the next window starts clean rather than
    // re-locking on the very next typo.
    expect(next.failedAttempts).toBe(0);
  });

  it('does not lock one failure below the threshold', () => {
    const state = { failedAttempts: MAX_FAILED_ATTEMPTS - 2, lockedUntil: null };
    expect(advanceOnFailure(state, NOW).lockedUntil).toBeNull();
  });

  it('never extends a lock that is already active', () => {
    const locked = { failedAttempts: 0, lockedUntil: inSeconds(300) };
    expect(advanceOnFailure(locked, NOW)).toEqual(locked);
  });

  it('restarts the count after a lock expires, instead of re-locking immediately', () => {
    const expired = { failedAttempts: 0, lockedUntil: inSeconds(-60) };
    expect(advanceOnFailure(expired, NOW)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it('discards a stale count left behind by an expired lock', () => {
    // The count from the window that caused the lock must not carry over, or a
    // single typo after a lock expires would lock the account again.
    const expired = { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: inSeconds(-1) };
    expect(advanceOnFailure(expired, NOW)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });
});

describe('clearOnSuccess', () => {
  it('clears both the count and the lock', () => {
    expect(clearOnSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });

  it('returns a fresh object each time, so callers cannot share state', () => {
    const first = clearOnSuccess();
    first.failedAttempts = 99;
    expect(clearOnSuccess().failedAttempts).toBe(0);
  });
});

describe('throttleStateOf', () => {
  it('treats a missing admin row as unlocked', () => {
    expect(throttleStateOf(undefined)).toEqual({ failedAttempts: 0, lockedUntil: null });
  });

  it('reads the stored columns off the row', () => {
    const lockedUntil = inSeconds(60);
    expect(throttleStateOf({ failedLoginAttempts: 5, lockedUntil })).toEqual({
      failedAttempts: 5,
      lockedUntil,
    });
  });

  it('does not hand back a shared unlocked object', () => {
    const first = throttleStateOf(undefined);
    first.failedAttempts = 42;
    expect(throttleStateOf(undefined).failedAttempts).toBe(0);
  });
});
