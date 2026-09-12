/**
 * Shared env/bindings type for the Worker.
 */
import type { DBEnv, DB } from './db/client';
import type { AuthEnv } from './auth';
import type { TranscriptionEnv } from './services/transcription';
import type { CaptionJobMessage } from './queue/messages';

export interface Env extends DBEnv, AuthEnv, TranscriptionEnv {
  /** Comma-separated list of allowed CORS origins (e.g. the Pages URL). */
  CORS_ORIGINS?: string;
  /** Cloudflare Queues producer binding for caption jobs. */
  CAPTION_QUEUE?: Queue<CaptionJobMessage>;
  /**
   * Edge rate limit for the login endpoint. Optional so local dev and any
   * account without the binding still work — the database-backed lock in
   * `auth/throttle.ts` is the layer that must always be present.
   */
  LOGIN_RATE_LIMITER?: RateLimit;
}

/** Hono app type shared by the root app and all route sub-apps,
 *  so `c.get('db')` / `c.get('user')` are typed everywhere. */
export type AppEnv = {
  Bindings: Env;
  Variables: { db: DB };
};
