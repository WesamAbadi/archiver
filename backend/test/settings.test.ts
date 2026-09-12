/**
 * App settings — service and route.
 *
 * The route is the only way the provider is chosen, and the value it writes
 * selects which paid API a background job calls. So the validation is tested
 * from the outside (a real request through the real router) rather than by
 * calling the schema directly: what matters is what a client can actually make
 * the server persist.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../src/env';
import type { DB } from '../src/db/client';
import { settingsRoutes } from '../src/routes/settings';
import { getAppSettings, saveAppSettings, DEFAULT_SETTINGS, SETTINGS_ID } from '../src/services/settings';
import { TRANSCRIPTION_MODELS } from '../src/services/transcription';

beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Service-level fake: only `query.appSettings` and `insert` are reached. */
function serviceDb(row: Record<string, unknown> | null) {
  const inserted: Record<string, unknown>[] = [];

  const db = {
    query: { appSettings: { findFirst: async () => row ?? undefined } },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { onConflictDoUpdate: () => ({ returning: async () => [values] }) };
      },
    }),
  };

  return { db: db as unknown as DB, inserted };
}

/**
 * Route-level fake: also answers `requireAuth` (a session lookup and a user
 * lookup) so requests reach the handler as a signed-in admin.
 */
function routeDb(row: Record<string, unknown> | null = null) {
  const inserted: Record<string, unknown>[] = [];

  const db = {
    // findSession: update(adminSessions).set().where().returning({ userId })
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [{ userId: 'admin-1' }] }) }),
    }),
    query: {
      users: {
        findFirst: async () => ({
          id: 'admin-1',
          uid: 'admin',
          email: null,
          displayName: null,
        }),
      },
      appSettings: { findFirst: async () => row ?? undefined },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { onConflictDoUpdate: () => ({ returning: async () => [values] }) };
      },
    }),
  };

  return { db: db as unknown as DB, inserted };
}

function app(db: unknown) {
  const hono = new Hono<AppEnv>();
  hono.use('/api/*', async (c, next) => {
    c.set('db', db as never);
    await next();
  });
  hono.route('/api/settings', settingsRoutes);
  return hono;
}

const ENV_WITH_BOTH_KEYS = {
  GROQ_API_KEY: 'g',
  GEMINI_API_KEY: 'x',
} as unknown as Env;

function request(
  db: unknown,
  path: string,
  init: RequestInit = {},
  env: Env = ENV_WITH_BOTH_KEYS,
) {
  return app(db).request(
    path,
    {
      ...init,
      headers: { Authorization: 'Bearer a'.padEnd(64, '0'), ...(init.headers ?? {}) },
    },
    env,
  );
}

function put(db: unknown, body: unknown, env: Env = ENV_WITH_BOTH_KEYS) {
  return request(
    db,
    '/api/settings',
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env,
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

describe('getAppSettings', () => {
  it('returns the defaults when nothing has been saved', async () => {
    const { db } = serviceDb(null);
    const settings = await getAppSettings(db);

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, isDefault: true });
  });

  it('returns a saved row and marks it as no longer default', async () => {
    const { db } = serviceDb({
      id: SETTINGS_ID,
      transcriptionProvider: 'GOOGLE',
      transcriptionModel: 'gemini-3.8-flash',
    });

    const settings = await getAppSettings(db);

    expect(settings).toEqual({
      provider: 'GOOGLE',
      model: 'gemini-3.8-flash',
      isDefault: false,
    });
  });

  it('falls back to the provider default when the stored model is empty', async () => {
    const { db } = serviceDb({
      id: SETTINGS_ID,
      transcriptionProvider: 'GOOGLE',
      transcriptionModel: '',
    });

    const settings = await getAppSettings(db);

    expect(settings.model).toBe(TRANSCRIPTION_MODELS.GOOGLE);
  });

  it('falls back to the provider default when the stored model is null', async () => {
    const { db } = serviceDb({
      id: SETTINGS_ID,
      transcriptionProvider: 'GROQ',
      transcriptionModel: null,
    });

    const settings = await getAppSettings(db);

    expect(settings.model).toBe(TRANSCRIPTION_MODELS.GROQ);
  });
});

describe('saveAppSettings', () => {
  it('upserts the single fixed row and reports it as saved', async () => {
    const { db, inserted } = serviceDb(null);

    const saved = await saveAppSettings(db, { provider: 'GOOGLE', model: 'gemini-3.8-flash' });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      id: SETTINGS_ID,
      transcriptionProvider: 'GOOGLE',
      transcriptionModel: 'gemini-3.8-flash',
    });
    expect(inserted[0]?.updatedAt).toBeInstanceOf(Date);
    expect(saved.isDefault).toBe(false);
    expect(saved.provider).toBe('GOOGLE');
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

describe('GET /api/settings', () => {
  it('reports the current value, the per-provider defaults and key availability', async () => {
    const { db } = routeDb(null);
    const res = await request(db, '/api/settings');

    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      provider: 'GROQ',
      model: TRANSCRIPTION_MODELS.GROQ,
      isDefault: true,
      defaultModels: TRANSCRIPTION_MODELS,
      available: { GROQ: true, GOOGLE: true },
    });
  });

  it('reports a provider without a key as unavailable rather than hiding it', async () => {
    const { db } = routeDb(null);
    const res = await request(db, '/api/settings', {}, { GROQ_API_KEY: 'g' } as unknown as Env);

    const body = (await res.json()) as { data: { available: Record<string, boolean> } };
    expect(body.data.available).toEqual({ GROQ: true, GOOGLE: false });
  });
});

describe('PUT /api/settings', () => {
  it('stores the provider and an explicit model', async () => {
    const { db, inserted } = routeDb(null);
    const res = await put(db, { provider: 'GROQ', model: 'whisper-large-v3' });

    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({
      transcriptionProvider: 'GROQ',
      transcriptionModel: 'whisper-large-v3',
    });
  });

  it('uses the new provider default when the model is omitted', async () => {
    const { db, inserted } = routeDb(null);
    const res = await put(db, { provider: 'GOOGLE' });

    expect(res.status).toBe(200);
    expect(inserted[0]?.transcriptionModel).toBe(TRANSCRIPTION_MODELS.GOOGLE);
  });

  it('returns the saved value and defaults so the UI needs no refetch', async () => {
    const { db } = routeDb(null);
    const res = await put(db, { provider: 'GOOGLE' });

    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      provider: 'GOOGLE',
      model: TRANSCRIPTION_MODELS.GOOGLE,
      isDefault: false,
      defaultModels: TRANSCRIPTION_MODELS,
    });
  });

  it.each([
    ['an unknown provider', { provider: 'OPENAI' }],
    ['a lowercase provider', { provider: 'groq' }],
    ['a missing provider', { model: 'whisper-large-v3' }],
    ['a blank model', { provider: 'GROQ', model: '   ' }],
    ['a model with a space', { provider: 'GROQ', model: 'whisper large v3' }],
    ['a model with a slash', { provider: 'GROQ', model: 'a/b' }],
    ['an over-long model', { provider: 'GROQ', model: 'a'.repeat(65) }],
    ['a numeric model', { provider: 'GROQ', model: 123 }],
    ['a null model', { provider: 'GROQ', model: null }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const { db, inserted } = routeDb(null);
    const res = await put(db, body);

    expect(res.status).toBe(400);
    expect(inserted).toEqual([]);
  });

  it('rejects a body that is not JSON', async () => {
    const { db, inserted } = routeDb(null);
    const res = await request(db, '/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    expect(inserted).toEqual([]);
  });

  it('accepts a model id containing the punctuation providers actually use', async () => {
    const { db, inserted } = routeDb(null);
    const res = await put(db, { provider: 'GOOGLE', model: 'gemini-2.5-flash-preview:0715' });

    expect(res.status).toBe(200);
    expect(inserted[0]?.transcriptionModel).toBe('gemini-2.5-flash-preview:0715');
  });

  it('allows selecting a provider with no key, and says so in the response', async () => {
    // The UI blocks this; the API does not, because a key can be added with a
    // deploy and the admin should not have to come back and re-save settings.
    const { db } = routeDb(null);
    const res = await put(db, { provider: 'GOOGLE' }, { GROQ_API_KEY: 'g' } as unknown as Env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { available: Record<string, boolean> } };
    expect(body.data.available.GOOGLE).toBe(false);
  });
});
