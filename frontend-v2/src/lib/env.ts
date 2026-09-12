/**
 * Single source of truth for frontend environment configuration.
 *
 * ── The one rule ─────────────────────────────────────────────────────────
 * VITE_API_URL is the API ORIGIN only:
 *   "" (empty = same-origin)  |  "https://archivedrop-api.<subdomain>.workers.dev"  |  "https://api.yourdomain.com"
 * No trailing slash, NO `/api` suffix. Every API call appends `/api/...` itself.
 *
 * (The old codebase read VITE_API_URL three different ways — with and without
 * the /api suffix — which produced the `api/api/auth/google` bug. That class
 * of confusion is now impossible: everything goes through here.)
 */

/** API origin, normalized: no trailing slash, no /api suffix. */
export const API_ORIGIN = (() => {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw.slice(0, -4) : raw;
})();

/** Full base for JSON API calls, e.g. "https://…/api" (or "/api" same-origin). */
export const API_BASE_URL = `${API_ORIGIN}/api`;

/** Google OAuth Web client ID (must match the backend's GOOGLE_CLIENT_ID). */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export const env = {
  API_ORIGIN,
  API_BASE_URL,
  GOOGLE_CLIENT_ID,
} as const;

declare global {
  interface ImportMetaEnv {
    /** API origin only — no /api suffix, no trailing slash ("" = same-origin) */
    readonly VITE_API_URL?: string;
    /** Google OAuth Web client ID */
    readonly VITE_GOOGLE_CLIENT_ID?: string;
  }
}

// Fail fast in dev if misconfigured
if (import.meta.env.DEV) {
  if (!GOOGLE_CLIENT_ID) {
    console.warn('[env] VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will not work. Copy frontend/.env.example to frontend/.env');
  }
  if (!API_ORIGIN && import.meta.env.PROD) {
    console.warn('[env] VITE_API_URL is empty in a production build — API calls will go same-origin.');
  }
}
