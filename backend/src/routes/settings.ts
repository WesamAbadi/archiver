/**
 * Settings routes — read and update app configuration.
 *
 * Admin-only, and there is only one admin, so there is no per-user scoping to get
 * wrong here. What this route *does* have to get right is validation: these
 * values select a paid external API and a model id, and a wrong one fails inside
 * a background job where nobody is watching. So the model id is constrained
 * here, and the UI can only offer what the API accepts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAuth } from '../auth';
import { getAppSettings, saveAppSettings } from '../services/settings';
import { PROVIDERS, TRANSCRIPTION_MODELS, defaultModelFor } from '../services/transcription';

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use('*', requireAuth);

const providerSchema = z.enum(PROVIDERS);

/**
 * Model ids are provider-defined strings (`whisper-large-v3-turbo`,
 * `gemini-3.8-flash`) and they change faster than migrations would, so this is a
 * format check rather than a list. The character set is what keeps an arbitrary
 * string out of a URL path and an outbound request — note `:` is allowed because
 * Google's `models/{model}:generateContent` shape uses it in some ids.
 */
const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Model ids may only contain letters, numbers, . _ : -');

const updateSchema = z.object({
  provider: providerSchema,
  /** Optional: omit to take the provider's default model. */
  model: modelSchema.optional(),
});

/** Which providers actually have credentials, so the UI can say so before a job fails. */
function availability(env: AppEnv['Bindings']) {
  return {
    GROQ: Boolean(env.GROQ_API_KEY),
    GOOGLE: Boolean(env.GEMINI_API_KEY),
  };
}

settingsRoutes.get('/', async (c) => {
  const db = c.get('db');
  const settings = await getAppSettings(db);

  return c.json({
    success: true,
    data: {
      ...settings,
      /** Per-provider defaults, so the UI never hardcodes a model id. */
      defaultModels: TRANSCRIPTION_MODELS,
      available: availability(c.env),
    },
  });
});

settingsRoutes.put('/', async (c) => {
  const db = c.get('db');

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Invalid settings', details: parsed.error.flatten() },
      400,
    );
  }

  const { provider } = parsed.data;
  // Switching provider must not carry the other one's model id across, or the
  // first job after the switch fails with an id the new provider has never heard
  // of. Omitting `model` therefore means the new provider's default.
  // `.trim().min(1)` in the schema already rejects a blank id, so there is no
  // second guard here to drift out of step with it.
  const model = parsed.data.model ?? defaultModelFor(provider);

  const saved = await saveAppSettings(db, { provider, model });

  return c.json({
    success: true,
    data: {
      ...saved,
      defaultModels: TRANSCRIPTION_MODELS,
      available: availability(c.env),
    },
  });
});
