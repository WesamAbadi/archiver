import { QueryClient } from '@tanstack/react-query';

/**
 * One query client for the app.
 *
 * Defaults chosen for a single-admin archive:
 * - staleTime 30s: the library rarely changes between navigations, so avoid
 *   refetching on every mount.
 * - retry 1: the API is a Worker; if a request fails it's usually a real
 *   error, and the error UI should say so quickly rather than after 3 waits.
 * - no refetchOnWindowFocus: focus refetches made the old app feel jumpy.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
