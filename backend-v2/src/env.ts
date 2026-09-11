/**
 * Shared env/bindings type for the Worker.
 */
import type { DBEnv } from './db/client';
import type { R2Env } from './services/r2';
import type { AuthEnv } from './auth';
import type { DB } from './db/client';

export interface Env extends DBEnv, R2Env, AuthEnv {
  /** Comma-separated list of allowed CORS origins (e.g. the Pages URL). */
  CORS_ORIGINS?: string;
}

/** Hono app type shared by the root app and all route sub-apps,
 *  so `c.get('db')` / `c.get('user')` are typed everywhere. */
export type AppEnv = {
  Bindings: Env;
  Variables: { db: DB };
};
