import { API_BASE_URL } from './env';
import type { Pagination } from './types';
import { clearSession, getToken } from '@/features/auth/session';

/**
 * The one way this app talks to the API.
 *
 * The old frontend had three competing conventions (a shared axios instance, raw
 * `axios('/api/…')` calls that skipped auth headers, and a `fetch` in the auth
 * service), which is how `api/auth` vs `/api/auth` bugs creep in. Everything
 * goes through here, so auth headers, error shape and 401 handling can't drift.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  /** status 0 means the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  message?: string;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * false = send no Authorization header and don't clear the session on a 401.
   * Only the login call uses this.
   */
  authenticated?: boolean;
}

type NoBodyOptions = Omit<RequestOptions, 'method' | 'body'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, signal, authenticated = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (authenticated) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Let react-query see aborts as aborts (it ignores them).
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;

    // A revoked or expired session must not leave the UI believing it's signed
    // in — clearing here funnels every caller into the same signed-out state.
    if (response.status === 401 && authenticated) clearSession();

    throw new ApiError(message, response.status, payload);
  }

  if (!isRecord(payload)) {
    throw new ApiError('The server returned an unexpected response.', response.status, payload);
  }

  return payload as unknown as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string, options: NoBodyOptions = {}) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options: NoBodyOptions = {}) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options: NoBodyOptions = {}) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options: NoBodyOptions = {}) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options: NoBodyOptions = {}) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
