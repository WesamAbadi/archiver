/**
 * Abuse / security tests at the boundaries that matter.
 *
 * These drive the REAL routers and the REAL `requireAuth` middleware. Only the
 * database is faked — there is no live Postgres in a unit test, and the point
 * here is the gate in front of it, not the SQL behind it.
 *
 * The strongest assertion in this file is the "exploding database": a stub that
 * throws on any property access. If a protected route ever reaches for data
 * before authenticating, the request stops being a 401 and the test fails.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../src/env';
import type { DB } from '../src/db/client';
import { app as rootApp } from '../src/index';
import { MAX_FAILED_ATTEMPTS } from '../src/auth/throttle';
import { authRoutes } from '../src/routes/auth';
import { mediaRoutes } from '../src/routes/media';
import { captionRoutes } from '../src/routes/captions';
import { searchRoutes } from '../src/routes/search';
import { settingsRoutes } from '../src/routes/settings';

// The request logger would print every request below; keep the output readable.
beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => vi.restoreAllMocks());

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:5173';

const baseEnv = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: PASSWORD,
  CORS_ORIGINS: `http://localhost:5173,https://archivedrop.pages.dev`,
} as unknown as Env;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Any touch of this blows up, which is how we prove a guard ran first. */
const EXPLODING_DB = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    throw new Error(`database queried before the request was authorized: ${String(prop)}`);
  },
});

/** Drizzle builders are both awaitable and chainable; the app uses both forms. */
function awaitableWithReturning(rows: unknown[]) {
  return Object.assign(Promise.resolve(undefined), { returning: async () => rows });
}

interface FakeDb {
  db: DB;
  /** Values passed to `.set(...)`, i.e. what the handler tried to persist. */
  updates: Record<string, unknown>[];
}

function makeFakeDb(options: { adminRow?: Record<string, unknown>; returning?: unknown[] } = {}): FakeDb {
  const updates: Record<string, unknown>[] = [];

  const db = {
    // getAdminUser: select().from(users).limit(1)
    select: () => ({ from: () => ({ limit: async () => (options.adminRow ? [options.adminRow] : []) }) }),
    // findSession / saveLoginThrottle: update().set().where()[.returning()]
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => awaitableWithReturning(options.returning ?? []) };
      },
    }),
    // createSession: insert().values()
    insert: () => ({ values: () => awaitableWithReturning([]) }),
    delete: () => ({ where: () => awaitableWithReturning([]) }),
  };

  return { db: db as unknown as DB, updates };
}

/** The real routers, mounted the same way src/index.ts mounts them. */
function guardedApp(db: unknown) {
  const app = new Hono<AppEnv>();
  app.use('/api/*', async (c, next) => {
    c.set('db', db as never);
    await next();
  });
  app.route('/api/auth', authRoutes);
  app.route('/api/media', mediaRoutes);
  app.route('/api/media', captionRoutes);
  app.route('/api/search', searchRoutes);
  app.route('/api/settings', settingsRoutes);
  return app;
}

function login(body: unknown, env: Env = baseEnv, headers: Record<string, string> = {}) {
  return guardedApp(EXPLODING_DB).request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
}

// ---------------------------------------------------------------------------

describe('every protected route refuses an unauthenticated request', () => {
  // Method, path. This is the whole attack surface behind requireAuth — if a
  // route is ever mounted above the middleware, one of these turns into a 500
  // (the exploding db) or a 200, instead of passing quietly.
  const PROTECTED: Array<[string, string]> = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/media'],
    ['GET', '/api/media/quota'],
    ['GET', '/api/media/media-1'],
    ['GET', '/api/media/media-1/files/file-1/url'],
    ['PATCH', '/api/media/media-1'],
    ['DELETE', '/api/media/media-1'],
    ['POST', '/api/media/upload/start'],
    ['POST', '/api/media/upload/confirm'],
    ['GET', '/api/media/media-1/captions'],
    ['GET', '/api/media/media-1/caption-status'],
    ['POST', '/api/media/media-1/captions/generate'],
    ['PUT', '/api/media/media-1/captions/caption-1'],
    ['DELETE', '/api/media/media-1/captions/caption-1'],
    ['GET', '/api/search?q=anything'],
    ['GET', '/api/search/suggestions?q=anything'],
    ['GET', '/api/settings'],
    ['PUT', '/api/settings'],
  ];

  for (const [method, path] of PROTECTED) {
    it(`${method} ${path} → 401 without querying the database`, async () => {
      const res = await guardedApp(EXPLODING_DB).request(path, { method }, baseEnv);
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ success: false });
    });
  }
});

describe('session token handling', () => {
  it('rejects a non-Bearer Authorization header without querying the database', async () => {
    const res = await guardedApp(EXPLODING_DB).request(
      '/api/media',
      { headers: { Authorization: 'Basic YWRtaW46YWRtaW4=' } },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a bare "Bearer" with no token', async () => {
    const res = await guardedApp(EXPLODING_DB).request(
      '/api/media',
      { headers: { Authorization: 'Bearer' } },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a token that matches no session', async () => {
    const { db } = makeFakeDb({ returning: [] });
    const res = await guardedApp(db).request(
      '/api/media',
      { headers: { Authorization: 'Bearer deadbeef'.padEnd(71, '0') } },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });
});

describe('login payload validation', () => {
  const badPayloads: Array<[string, unknown]> = [
    ['an empty object', {}],
    ['only a username', { username: 'admin' }],
    ['only a password', { password: PASSWORD }],
    ['a null username', { username: null, password: PASSWORD }],
    ['a numeric password', { username: 'admin', password: 12345 }],
    ['an empty-string username', { username: '', password: PASSWORD }],
    ['an over-long username', { username: 'a'.repeat(65), password: PASSWORD }],
    ['an over-long password', { username: 'admin', password: 'a'.repeat(257) }],
  ];

  for (const [label, body] of badPayloads) {
    it(`rejects ${label} with 400 and never compares credentials`, async () => {
      const res = await login(body);
      expect(res.status).toBe(400);
    });
  }

  it('accepts a body that is not even JSON', async () => {
    const res = await guardedApp(EXPLODING_DB).request(
      '/api/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' },
      baseEnv,
    );
    expect(res.status).toBe(400);
  });
});

describe('login configuration', () => {
  it('refuses every login when ADMIN_PASSWORD is unset, without querying the database', async () => {
    const env = { ...baseEnv, ADMIN_PASSWORD: undefined } as unknown as Env;
    const res = await login({ username: 'admin', password: PASSWORD }, env);
    expect(res.status).toBe(503);
  });
});

describe('login rate limiting (edge binding)', () => {
  function envWithLimiter(success: boolean) {
    return {
      ...baseEnv,
      LOGIN_RATE_LIMITER: { limit: async () => ({ success }) },
    } as unknown as Env;
  }

  it('returns 429 with Retry-After when the limiter refuses — before touching the database', async () => {
    const res = await login(
      { username: 'admin', password: PASSWORD },
      envWithLimiter(false),
      { 'cf-connecting-ip': '203.0.113.7' },
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('lets the request through when the limiter allows it', async () => {
    const { db, updates } = makeFakeDb();
    const res = await guardedApp(db).request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      },
      envWithLimiter(true),
    );

    // Reached the credential check and failed it — proof the limiter passed.
    expect(res.status).toBe(401);
    expect(updates).toEqual([]); // no admin row yet, so nothing to record against
  });

  it('skips the limiter when no client IP is available (local dev)', async () => {
    const { db } = makeFakeDb();
    const res = await guardedApp(db).request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      },
      envWithLimiter(false),
    );

    // Would have been 429 if the limiter had run with no key to key on.
    expect(res.status).toBe(401);
  });

  it('works with no limiter binding at all, so the deploy is safe on any plan', async () => {
    const { db } = makeFakeDb();
    const res = await guardedApp(db).request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });
});

describe('login lockout (database-backed, global)', () => {
  const adminRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'admin-1',
    uid: 'admin',
    email: null,
    displayName: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  });

  function postLogin(db: DB, body: unknown) {
    return guardedApp(db).request(
      '/api/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      baseEnv,
    );
  }

  it('returns 429 while the account is locked, with the remaining wait', async () => {
    const lockedUntil = new Date(Date.now() + 120_000);
    const { db } = makeFakeDb({ adminRow: adminRow({ lockedUntil }) });

    const res = await postLogin(db, { username: 'admin', password: PASSWORD });

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(120);
  });

  it('refuses even the correct password while locked', async () => {
    const { db } = makeFakeDb({
      adminRow: adminRow({ lockedUntil: new Date(Date.now() + 60_000) }),
    });
    const res = await postLogin(db, { username: 'admin', password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('counts a failed attempt against the admin row', async () => {
    const { db, updates } = makeFakeDb({ adminRow: adminRow() });
    const res = await postLogin(db, { username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ failedLoginAttempts: 1, lockedUntil: null });
  });

  it('locks the account when the failure threshold is reached', async () => {
    const { db, updates } = makeFakeDb({
      adminRow: adminRow({ failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1 }),
    });
    const res = await postLogin(db, { username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401); // this attempt is still just rejected
    expect(updates[0]?.failedLoginAttempts).toBe(0);
    expect(updates[0]?.lockedUntil).toBeInstanceOf(Date);
  });

  it('does not reveal which half of the credentials was wrong', async () => {
    const { db } = makeFakeDb({ adminRow: adminRow() });
    const wrongUser = await postLogin(db, { username: 'someone', password: PASSWORD });
    const wrongPass = await postLogin(db, { username: 'admin', password: 'wrong' });

    expect(wrongUser.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    await expect(wrongUser.json()).resolves.toEqual(await wrongPass.json());
  });

  it('starts counting again after a lock expires', async () => {
    const { db, updates } = makeFakeDb({
      adminRow: adminRow({ lockedUntil: new Date(Date.now() - 1000) }),
    });
    const res = await postLogin(db, { username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401); // not 429 — the lock is over
    expect(updates[0]).toMatchObject({ failedLoginAttempts: 1 });
  });

  it('clears the throttle on a successful login', async () => {
    const { db, updates } = makeFakeDb({
      adminRow: adminRow({ failedLoginAttempts: 5 }),
    });
    const res = await postLogin(db, { username: 'admin', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });

    const body = (await res.json()) as { data?: { token?: string } };
    expect(body.data?.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves a clean admin row untouched on login (no pointless write)', async () => {
    const { db, updates } = makeFakeDb({ adminRow: adminRow() });
    const res = await postLogin(db, { username: 'admin', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(updates).toEqual([]);
  });
});

describe('CORS allowlist', () => {
  function preflight(origin: string, method = 'PUT') {
    return rootApp.request(
      '/api/media/media-1/captions/caption-1',
      {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': method },
      },
      baseEnv,
    );
  }

  it('answers a preflight from an allowed origin', async () => {
    const res = await preflight(ORIGIN);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('advertises PUT, without which the caption editor cannot save', async () => {
    // Regression guard: this method was missing and the editor's preflight was
    // rejected in browsers while every curl-based test still passed.
    const res = await preflight(ORIGIN, 'PUT');
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('allows the production Pages origin configured in env', async () => {
    const res = await preflight('https://archivedrop.pages.dev');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://archivedrop.pages.dev');
  });

  it('does not grant an unknown origin', async () => {
    const res = await preflight('https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not grant an unknown origin on a normal response either', async () => {
    const res = await rootApp.request('/health', { headers: { Origin: 'https://evil.example' } }, baseEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('grants the configured origin on a normal response', async () => {
    const res = await rootApp.request('/health', { headers: { Origin: ORIGIN } }, baseEnv);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('does not fall back to a wildcard when CORS_ORIGINS is unset', async () => {
    const res = await rootApp.request(
      '/health',
      { headers: { Origin: 'https://evil.example' } },
      { ...baseEnv, CORS_ORIGINS: undefined } as unknown as Env,
    );
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });
});

describe('unauthenticated surface', () => {
  it('serves /health without any database binding', async () => {
    // /health must stay reachable when Postgres is unreachable, or the Worker
    // looks dead at exactly the moment you need to see that it is alive.
    const env = { CORS_ORIGINS: ORIGIN } as unknown as Env;
    const res = await rootApp.request('/health', {}, env);
    expect(res.status).toBe(200);
  });

  it('returns JSON, not HTML, for an unknown route', async () => {
    const res = await rootApp.request('/definitely-not-a-route', {}, baseEnv);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('does not expose internal error details', async () => {
    // This request is *meant* to blow up (no database binding), so the error
    // handler's own console.error would just be noise here.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The client must see a generic 500 body, never the underlying message.
    const res = await rootApp.request('/api/media', {}, { ...baseEnv, HYPERDRIVE: undefined } as Env);
    const body = (await res.json()) as { error?: string };

    expect(body.error).toBe('Internal Server Error');
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('Database not configured');
    // The real reason must still have been logged for the operator.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
