import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Toasts — a tiny external store, same pattern as the session store.
 *
 * No dependency: the old app pulled in `react-hot-toast` for this, and a queue
 * of twenty lines doesn't need a library. Errors get an explicit duration of 0
 * (sticky) so a failure can't vanish before it's read.
 */

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function push(tone: ToastTone, message: string, durationMs: number) {
  const id = nextId++;
  toasts = [...toasts, { id, tone, message }];
  emit();

  if (durationMs > 0) {
    setTimeout(() => dismiss(id), durationMs);
  }
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push('success', message, 4000),
  error: (message: string) => push('error', message, 0),
  info: (message: string) => push('info', message, 4000),
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success/30 text-ink',
  error: 'border-danger/40 text-ink',
  info: 'border-border-strong text-ink',
};

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const TONE_ICON_CLASSES: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

export function ToastViewport() {
  const [current, setCurrent] = useState<Toast[]>(toasts);

  useEffect(() => {
    const listener: Listener = (next) => setCurrent(next);
    listeners.add(listener);
    listener(toasts);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (current.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {current.map((item) => {
        const Icon = TONE_ICONS[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-md border bg-surface-2 px-4 py-3',
              'shadow-[var(--shadow-lift)]',
              TONE_STYLES[item.tone],
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_ICON_CLASSES[item.tone])} />
            <p className="flex-1 text-[13px] leading-relaxed">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="-mr-1 rounded-xs p-1 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
