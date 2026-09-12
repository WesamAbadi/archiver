import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Caption,
  CaptionStatusResponse,
  MediaItem,
  Pagination,
  StorageQuota,
  UploadStartResult,
} from '@/lib/types';

/**
 * Every media/caption call in one module.
 *
 * The old frontend had each page reach for axios itself, which is how some
 * screens ended up without auth headers and others without error handling.
 * Pages here only consume hooks, so query keys can't drift and every mutation
 * invalidates the right caches.
 */

export const mediaKeys = {
  all: ['media'] as const,
  list: (page: number, limit: number) => ['media', 'list', page, limit] as const,
  detail: (id: string) => ['media', 'detail', id] as const,
  captions: (id: string) => ['media', 'captions', id] as const,
  captionStatus: (id: string) => ['media', 'caption-status', id] as const,
  quota: ['media', 'quota'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useMediaList(page: number, limit = 24) {
  return useQuery({
    queryKey: mediaKeys.list(page, limit),
    queryFn: async () => {
      const envelope = await api.get<MediaItem[]>(`/media?page=${page}&limit=${limit}`);
      return {
        items: envelope.data,
        pagination: envelope.pagination as Pagination | undefined,
      };
    },
  });
}

export function useMediaItem(id: string | undefined) {
  return useQuery({
    queryKey: mediaKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const envelope = await api.get<MediaItem>(`/media/${id}`);
      return envelope.data;
    },
  });
}

export function useCaptions(id: string | undefined) {
  return useQuery({
    queryKey: mediaKeys.captions(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const envelope = await api.get<Caption[]>(`/media/${id}/captions`);
      return envelope.data;
    },
  });
}

export function useQuota() {
  return useQuery({
    queryKey: mediaKeys.quota,
    queryFn: async () => {
      const envelope = await api.get<StorageQuota>('/media/quota');
      return envelope.data;
    },
  });
}

/**
 * Poll caption status while a job is in flight.
 *
 * Replaces the old app's Socket.IO progress channel, which silently stopped
 * delivering events and left uploads spinning forever. Polling a status
 * endpoint can't get stuck "connected" — it either answers or errors.
 */
export function useCaptionStatus(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: mediaKeys.captionStatus(id ?? ''),
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const envelope = await api.get<CaptionStatusResponse>(`/media/${id}/caption-status`);
      return envelope.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.captionStatus;
      if (status === 'PENDING' || status === 'QUEUED' || status === 'PROCESSING') return 4000;
      return false;
    },
  });
}

export function usePlaybackUrl(mediaId: string | undefined, fileId: string | undefined) {
  return useQuery({
    queryKey: ['media', 'playback', mediaId ?? '', fileId ?? ''],
    enabled: Boolean(mediaId && fileId),
    // Signed URLs expire; refetch before the 6h TTL rather than shipping a
    // dead URL to the <audio> element.
    staleTime: 5 * 60 * 60 * 1000,
    queryFn: async () => {
      const envelope = await api.get<{ url: string; expiresAt: string }>(
        `/media/${mediaId}/files/${fileId}/url`,
      );
      return envelope.data;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/media/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

export function useUpdateMedia(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { title?: string; description?: string | null; tags?: string[] }) => {
      const envelope = await api.patch<MediaItem>(`/media/${id}`, updates);
      return envelope.data;
    },
    onSuccess: (item) => {
      queryClient.setQueryData(mediaKeys.detail(id), item);
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

export function useGenerateCaptions(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const envelope = await api.post<{ jobId: string; status: string }>(
        `/media/${id}/captions/generate`,
      );
      return envelope.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.captionStatus(id) });
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

export function useDeleteCaption(mediaId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (captionId: string) => {
      await api.delete(`/media/${mediaId}/captions/${captionId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

export function useSaveSegments(mediaId: string, captionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (segments: { id?: string; startTime: number; endTime: number; text: string }[]) => {
      const envelope = await api.put<Caption>(`/media/${mediaId}/captions/${captionId}`, {
        segments,
      });
      return envelope.data;
    },
    onSuccess: (caption) => {
      queryClient.setQueryData<Caption[]>(mediaKeys.captions(mediaId), (existing) =>
        existing ? existing.map((c) => (c.id === caption.id ? caption : c)) : [caption],
      );
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Upload lifecycle
// ---------------------------------------------------------------------------

export interface UploadInput {
  file: File;
  title: string;
  description?: string;
  tags: string[];
}

/**
 * Full presigned upload: start → PUT to R2 (with progress) → confirm.
 *
 * The PUT goes straight to R2, so the Worker never sees the bytes. `fetch`
 * cannot report upload progress, so this uses XMLHttpRequest — the one place in
 * the app that isn't `fetch`, and the reason is worth the exception.
 */
export function useUploadMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadInput & { onProgress?: (percent: number) => void }) => {
      const { file, title, description, tags, onProgress } = input;

      const start = await api.post<UploadStartResult>('/media/upload/start', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        title,
        description,
        tags,
      });

      await putToStorage(start.data.uploadUrl, file, onProgress);

      const confirm = await api.post<MediaItem>('/media/upload/confirm', {
        mediaItemId: start.data.mediaItemId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });

      return confirm.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}

function putToStorage(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url, true);

    // Content-Type is deliberately NOT set: the presigned URL is signed without
    // it, and adding a header that wasn't signed makes R2 reject the request.
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      // A 403 here almost always means the R2 API token lacks write permission,
      // not that the file is bad — say so, because it's the opposite of obvious.
      reject(new Error(`Upload to storage failed (${request.status}). Check the R2 token permissions.`));
    });

    request.addEventListener('error', () =>
      reject(new Error('Upload failed — could not reach storage.')),
    );
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    request.send(file);
  });
}
