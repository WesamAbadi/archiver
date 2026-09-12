import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border-strong bg-surface-3 text-ink-muted',
  accent: 'border-accent-dim/60 bg-accent/12 text-accent',
  success: 'border-success/30 bg-success/12 text-success',
  warning: 'border-warning/30 bg-warning/12 text-warning',
  danger: 'border-danger/30 bg-danger/12 text-danger',
  info: 'border-info/30 bg-info/12 text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5',
        'font-mono text-[10px] uppercase tracking-[0.12em]',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
