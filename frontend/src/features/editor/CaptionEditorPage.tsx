import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatTimecode } from '@/lib/format';
import { RTL_FONT_STACK, textDirection } from '@/lib/rtl';
import { useUndoableState } from '@/lib/useUndoableState';
import { usePlaybackUrl, useCaptions, useMediaItem, useSaveSegments } from '@/features/media/api';
import type { CaptionSegment } from '@/lib/types';

interface DraftSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export function CaptionEditorPage() {
  const { id } = useParams<{ id: string }>();

  const item = useMediaItem(id);
  const captions = useCaptions(id);
  const caption = captions.data?.[0];
  const file = item.data?.files[0];
  const playback = usePlaybackUrl(id, file?.id);

  const editor = useUndoableState<DraftSegment[]>([], { limit: 200 });
  const [loaded, setLoaded] = useState(false);
  // The last server-confirmed content — NOT a revision counter. A counter can
  // only tell you "an edit happened", so undoing back to the saved text still
  // looked like unsaved work (Save stayed lit, and navigating away warned about
  // losing changes that no longer existed). Comparing content is what the user
  // actually means by "unsaved".
  const [saved, setSaved] = useState<DraftSegment[]>([]);

  const save = useSaveSegments(id ?? '', caption?.id ?? '');
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  // Seed the editor from the server exactly once (and again after an explicit
  // save, which resets the baseline). Re-seeding on every background refetch
  // would silently discard in-progress edits.
  const reset = editor.reset;
  useEffect(() => {
    if (!loaded && caption) {
      const initial = toDrafts(caption.segments);
      reset(initial);
      setSaved(initial);
      setLoaded(true);
    }
  }, [caption, loaded, reset]);

  const drafts = editor.value;
  const dirty = loaded && !segmentsEqual(drafts, saved);

  const issues = useMemo(() => validate(drafts), [drafts]);
  const blocking = issues.filter((issue) => issue.severity === 'error');

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.key.toLowerCase() !== 'z') return;

      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  // Warn before losing unsaved work.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function updateSegment(index: number, patch: Partial<DraftSegment>, groupKey?: string) {
    editor.set(
      (previous) => previous.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)),
      groupKey,
    );
  }

  function addSegmentAfter(index: number) {
    editor.set((previous) => {
      const target = previous[index];
      const next = previous[index + 1];
      const start = target?.endTime ?? 0;
      // Split the gap to the following segment, or extend by four seconds.
      const end = next ? Math.max(start + 1, (start + next.startTime) / 2) : start + 4;

      const created: DraftSegment = {
        id: `new-${Date.now()}`,
        startTime: round(start),
        endTime: round(end),
        text: '',
      };
      return [...previous.slice(0, index + 1), created, ...previous.slice(index + 1)];
    });
  }

  function removeSegment(index: number) {
    editor.set((previous) => previous.filter((_, i) => i !== index));
  }

  function seek(seconds: number) {
    const element = mediaRef.current;
    if (!element) return;
    element.currentTime = seconds;
  }

  async function handleSave() {
    if (blocking.length > 0) {
      toast.error('Fix the highlighted timings before saving.');
      return;
    }

    try {
      const result = await save.mutateAsync(
        drafts.map((segment) => ({
          id: segment.id.startsWith('new-') ? undefined : segment.id,
          startTime: round(segment.startTime),
          endTime: round(segment.endTime),
          text: segment.text.trim(),
        })),
      );

      const persisted = toDrafts(result.segments);
      editor.reset(persisted);
      setSaved(persisted);
      toast.success('Transcript saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the transcript.');
    }
  }

  if (item.isPending || captions.isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6 text-accent" label="Loading editor" />
      </div>
    );
  }

  if (!caption) {
    return (
      <EmptyState
        title="No transcript to edit"
        description="Run transcription first, then come back to correct the text."
        action={
          <Link to={id ? `/watch/${id}` : '/library'}>
            <Button variant="secondary">Back to the item</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/watch/${id}`}
          className="inline-flex items-center gap-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          {item.data?.title ?? 'Back'}
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={editor.undo}
            disabled={!editor.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={editor.redo}
            disabled={!editor.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="size-4" />
          </Button>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              editor.reset(saved);
              toast.info('Changes discarded.');
            }}
          >
            Discard
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={!dirty}
            loading={save.isPending}
            onClick={handleSave}
          >
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>

      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink">Edit transcript</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {drafts.length} segments
          {dirty && <span className="ml-2 text-warning">· unsaved changes</span>}
        </p>
      </header>

      {playback.data && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={playback.data.url}
            controls
            className="w-full"
          />
        </div>
      )}

      {issues.length > 0 && (
        <div className="mb-6 rounded-md border border-warning/30 bg-warning/8 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="size-4" />
            {blocking.length > 0 ? 'Fix these before saving' : 'Worth checking'}
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-ink-muted">
            {issues.slice(0, 6).map((issue) => (
              <li key={`${issue.index}-${issue.message}`}>
                Segment {issue.index + 1}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-3">
        {drafts.map((segment, index) => {
          const direction = textDirection(segment.text);
          const invalid = segment.endTime <= segment.startTime;

          return (
            <li
              key={segment.id}
              className={cn(
                'rounded-lg border bg-surface p-4',
                invalid ? 'border-danger/50' : 'border-border',
              )}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-[11px] text-ink-faint">
                  #{String(index + 1).padStart(3, '0')}
                </span>

                <div className="flex items-center gap-1.5">
                  <TimeInput
                    value={segment.startTime}
                    onChange={(startTime) => updateSegment(index, { startTime })}
                    label={`Segment ${index + 1} start time`}
                  />
                  <span className="text-ink-faint">→</span>
                  <TimeInput
                    value={segment.endTime}
                    onChange={(endTime) => updateSegment(index, { endTime })}
                    label={`Segment ${index + 1} end time`}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => seek(segment.startTime)}
                  className="font-mono text-[11px] text-ink-faint transition-colors hover:text-accent"
                  title="Jump the player here"
                >
                  ▶ {formatTimecode(segment.startTime, true)}
                </button>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => addSegmentAfter(index)}
                    aria-label={`Add a segment after ${index + 1}`}
                    className="rounded-sm p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Plus className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(index)}
                    aria-label={`Delete segment ${index + 1}`}
                    className="rounded-sm p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <textarea
                value={segment.text}
                dir={direction}
                style={direction === 'rtl' ? { fontFamily: RTL_FONT_STACK } : undefined}
                onChange={(e) =>
                  // groupKey ties consecutive keystrokes in THIS segment into one
                  // undo step, so Ctrl+Z reverts a sentence rather than a letter.
                  updateSegment(index, { text: e.target.value }, `text-${segment.id}`)
                }
                onBlur={editor.breakGroup}
                rows={2}
                placeholder="Segment text…"
                aria-label={`Segment ${index + 1} text`}
                className="w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent-dim focus:outline-none focus-visible:outline-none"
              />
            </li>
          );
        })}
      </ol>

      <Button
        variant="secondary"
        className="mt-4 w-full"
        onClick={() => editor.set((previous) => [...previous, blankSegment(previous)])}
      >
        <Plus className="size-4" />
        Add segment at the end
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TimeInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={round(value)}
      aria-label={label}
      onChange={(e) => {
        const parsed = Number.parseFloat(e.target.value);
        onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
      }}
      className="w-24 rounded-sm border border-border bg-surface-2 px-2 py-1 font-mono text-[12px] tabular-nums text-ink focus:border-accent-dim focus:outline-none focus-visible:outline-none"
    />
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Content comparison for the dirty check.
 *
 * Times are compared rounded, because the API stores `double precision` and a
 * value like 0.1 can come back as 0.09999999999999999 — which would otherwise
 * mark a freshly-loaded editor as already having unsaved changes.
 */
function segmentsEqual(a: DraftSegment[], b: DraftSegment[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((segment, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      segment.id === other.id &&
      round(segment.startTime) === round(other.startTime) &&
      round(segment.endTime) === round(other.endTime) &&
      segment.text === other.text
    );
  });
}

function toDrafts(segments: CaptionSegment[]): DraftSegment[] {
  return segments.map((segment) => ({
    id: segment.id,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
  }));
}

function blankSegment(existing: DraftSegment[]): DraftSegment {
  const last = existing[existing.length - 1];
  const start = last?.endTime ?? 0;
  return { id: `new-${Date.now()}`, startTime: round(start), endTime: round(start + 4), text: '' };
}

interface Issue {
  index: number;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Validation the API also enforces — surfaced here so the editor explains the
 * problem instead of the request coming back 400 with "Invalid segments".
 */
function validate(segments: DraftSegment[]): Issue[] {
  const issues: Issue[] = [];

  segments.forEach((segment, index) => {
    if (segment.endTime <= segment.startTime) {
      issues.push({ index, severity: 'error', message: 'end time must be after start time' });
    }
    if (segment.text.trim().length === 0) {
      issues.push({ index, severity: 'error', message: 'text is empty' });
    }

    const next = segments[index + 1];
    if (next && segment.endTime > next.startTime) {
      issues.push({ index, severity: 'warning', message: 'overlaps the next segment' });
    }
  });

  return issues;
}
