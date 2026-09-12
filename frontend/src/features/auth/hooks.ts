import { useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LoginResult } from '@/lib/types';
import {
  clearSession,
  getSession,
  setSession,
  subscribeSession,
  type SessionSnapshot,
} from './session';

export function useSession(): SessionSnapshot {
  // Server snapshot is always null — we never render as signed-in during SSR.
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}

export function useLogin() {
  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const envelope = await api.post<LoginResult>('/auth/login', credentials, {
        authenticated: false,
      });
      return envelope.data;
    },
    onSuccess: (data) => {
      setSession({ token: data.token, user: data.user, expiresAt: data.expiresAt });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // Revoking server-side is best effort; signing out locally must never
        // be blocked by a network or auth failure.
      }
    },
    onSettled: () => {
      clearSession();
      // Drop every cached response so the next sign-in starts clean.
      queryClient.clear();
    },
  });
}
