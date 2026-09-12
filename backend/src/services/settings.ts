/**
 * App settings — one row, read by the queue consumer and written from Settings.
 *
 * There is no auto-insert on read: a missing row is a perfectly good way to say
 * "nothing has been changed", so reads stay read-only and the row appears the
 * first time something is actually saved. That also keeps the defaults in code
 * (see `DEFAULT_SETTINGS`) as the single source of truth rather than duplicating
 * them in a seeded row that could drift.
 */
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { appSettings, type TranscriptionProvider } from '../db/schema';
import { defaultModelFor } from './transcription';

/** Fixed id — there is exactly one settings row, exactly like the one admin row. */
export const SETTINGS_ID = 'app';

export interface AppSettingsValue {
  provider: TranscriptionProvider;
  model: string;
}

export interface ResolvedAppSettings extends AppSettingsValue {
  /** True when nothing has been saved yet, so the UI can say so. */
  isDefault: boolean;
}

export const DEFAULT_SETTINGS: AppSettingsValue = {
  provider: 'GROQ',
  model: defaultModelFor('GROQ'),
};

/**
 * Read settings, falling back to the defaults.
 *
 * Never throws for a missing row — callers are background jobs, and a queue
 * consumer that cannot decide which provider to use has nothing useful to do
 * with an error.
 */
export async function getAppSettings(db: DB): Promise<ResolvedAppSettings> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SETTINGS_ID),
  });

  if (!row) return { ...DEFAULT_SETTINGS, isDefault: true };

  return {
    provider: row.transcriptionProvider,
    model: row.transcriptionModel || defaultModelFor(row.transcriptionProvider),
    isDefault: false,
  };
}

/** Create or replace the single settings row. */
export async function saveAppSettings(db: DB, value: AppSettingsValue): Promise<ResolvedAppSettings> {
  const now = new Date();
  const [row] = await db
    .insert(appSettings)
    .values({
      id: SETTINGS_ID,
      transcriptionProvider: value.provider,
      transcriptionModel: value.model,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        transcriptionProvider: value.provider,
        transcriptionModel: value.model,
        updatedAt: now,
      },
    })
    .returning();

  return {
    provider: row?.transcriptionProvider ?? value.provider,
    model: row?.transcriptionModel ?? value.model,
    isDefault: false,
  };
}
