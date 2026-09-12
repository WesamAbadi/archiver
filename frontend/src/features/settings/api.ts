import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AppSettingsResponse, TranscriptionProvider } from '@/lib/types';

/**
 * Settings data layer.
 *
 * Its own module rather than an addition to `media/api.ts`: these values are
 * read once on an admin screen, not on the hot path, and nothing else needs to
 * invalidate them. Keeping them separate is what lets the cache key be a single
 * entry instead of a per-media one.
 */

export const settingsKeys = {
  all: ['settings'] as const,
  transcription: ['settings', 'transcription'] as const,
};

export function useAppSettings() {
  return useQuery({
    queryKey: settingsKeys.transcription,
    queryFn: async () => {
      const envelope = await api.get<AppSettingsResponse>('/settings');
      return envelope.data;
    },
    // Provider and model change only through this page, so there is nothing to
    // poll for — the mutation below writes the fresh value straight into cache.
    staleTime: 5 * 60 * 1000,
  });
}

export interface UpdateAppSettingsInput {
  provider: TranscriptionProvider;
  /**
   * Omit to take the new provider's default model. Switching provider without
   * clearing the model would carry `whisper-*` across to Google, so the UI
   * omits it deliberately when the provider changes.
   */
  model?: string;
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAppSettingsInput) => {
      const envelope = await api.put<AppSettingsResponse>('/settings', input);
      return envelope.data;
    },
    onSuccess: (data) => {
      // The response already carries the saved value, so seed it rather than
      // refetching — an immediate refetch could race the write's read replica.
      queryClient.setQueryData(settingsKeys.transcription, data);
    },
  });
}
