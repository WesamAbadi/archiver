import { useRef, useState, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useUploadMedia } from '@/features/media/api';
import { toast } from '@/components/ui/toast';

/** Mirrors the API's allowlist — reject early rather than after a 400. */
const ACCEPT = 'audio/*,video/*,image/*';

function defaultTitle(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useUploadMedia();

  function reset() {
    setFile(null);
    setTitle('');
    setTags('');
    setDescription('');
    setProgress(0);
    setError(null);
    setDragging(false);
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);
    if (next && !title) setTitle(defaultTitle(next));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) chooseFile(dropped);
  }

  async function handleSubmit() {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Give the item a title.');
      return;
    }

    setError(null);
    setProgress(0);

    try {
      await upload.mutateAsync({
        file,
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        onProgress: setProgress,
      });

      toast.success('Uploaded. Transcription was queued automatically.');
      reset();
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed.';
      setError(message);
    }
  }

  const busy = upload.isPending;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return; // never close mid-upload and orphan the object
        reset();
        onClose();
      }}
      title="Add to the archive"
      description="The file uploads straight to storage — it never passes through the API."
    >
      <div className="space-y-4">
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center transition-colors',
              dragging
                ? 'border-accent bg-accent/5'
                : 'border-border-strong hover:border-accent-dim hover:bg-surface-2/50',
            )}
          >
            <UploadCloud className={cn('size-8', dragging ? 'text-accent' : 'text-ink-faint')} />
            <p className="mt-3 text-sm text-ink">Drop a file here, or click to browse</p>
            <p className="mt-1 text-[13px] text-ink-faint">Audio, video or image</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{file.name}</p>
              <p className="font-mono text-[11px] text-ink-faint">
                {formatBytes(file.size)} · {file.type || 'unknown type'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Change
            </Button>
          </div>
        )}

        {busy && (
          <div>
            <div className="flex justify-between text-[13px] text-ink-muted">
              <span>{progress < 100 ? 'Uploading…' : 'Verifying…'}</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-accent transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The file's name, unless you change it"
          disabled={busy}
        />

        <TextField
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated, tags"
          hint="Optional. Max 20."
          disabled={busy}
        />

        <div className="w-full">
          <label htmlFor="upload-description" className="mb-2 block text-[13px] font-medium text-ink-muted">
            Notes
          </label>
          <textarea
            id="upload-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={busy}
            placeholder="Optional context for this recording"
            className="w-full resize-y rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent-dim focus:outline-none focus-visible:outline-none disabled:opacity-60"
          />
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!file} onClick={handleSubmit}>
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  );
}
