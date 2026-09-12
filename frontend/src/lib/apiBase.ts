/**
 * Single source of truth for the API base URL.
 *
 * VITE_API_URL is an ORIGIN — no trailing slash and NO `/api` suffix; the code
 * appends `/api` itself. The old app mixed both conventions (and read the value
 * in three different places), which produced the `/api/api/auth` bug. Everything
 * now derives from here.
 *
 *   prod: https://archivedrop-api.<subdomain>.workers.dev
 *   dev : http://localhost:8787        (or "" to go same-origin through a proxy)
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  // Tolerate the old-style value (e.g. http://localhost:3003/api) instead of
  // silently producing /api/api/...
  .replace(/\/api$/, '')

export const API_BASE_URL = `${API_ORIGIN}/api`
