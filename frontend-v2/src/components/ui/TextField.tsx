import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  /** Rendered inside the field, left-aligned (e.g. an icon). */
  leading?: ReactNode;
  /** Rendered inside the field, right-aligned (e.g. a reveal toggle). */
  trailing?: ReactNode;
  error?: string | null;
  hint?: string;
  /** Visually hides the label but keeps it for screen readers. */
  hideLabel?: boolean;
};

export function TextField({
  label,
  leading,
  trailing,
  error,
  hint,
  hideLabel = false,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className={cn(
          'mb-2 block text-[13px] font-medium text-ink-muted',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>

      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {leading}
          </span>
        )}

        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            'h-11 w-full rounded-md border bg-surface-2 text-ink transition-colors',
            'placeholder:text-ink-faint',
            'focus:outline-none focus-visible:outline-none',
            error
              ? 'border-danger/60 focus:border-danger'
              : 'border-border focus:border-accent-dim',
            leading ? 'pl-10' : 'pl-3.5',
            trailing ? 'pr-11' : 'pr-3.5',
            'disabled:opacity-60',
            className,
          )}
          {...rest}
        />

        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>

      {(error || hint) && (
        <p
          id={describedById}
          className={cn('mt-2 text-[13px]', error ? 'text-danger' : 'text-ink-faint')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
