import { useCallback, useRef, useState } from 'react';

/**
 * Undo/redo for editor state.
 *
 * The old caption editor tracked history as a plain array and pushed on every
 * keystroke, with `redo` implemented by splicing the last two entries — which
 * is why redo produced duplicated lines and why undoing a burst of typing took
 * one click per character.
 *
 * This keeps the conventional past / present / future stacks, so:
 * - undo moves present → future, redo moves it back (no duplication possible)
 * - a `groupKey` coalesces rapid edits to the same field into ONE entry, so
 *   typing a sentence is a single undo step
 * - history is bounded, so a long session can't grow memory without limit
 */

export interface UndoableState<T> {
  value: T;
  /** `groupKey` coalesces edits from the same field within `groupWindowMs`. */
  set: (updater: T | ((previous: T) => T), groupKey?: string) => void;
  /** Overwrite without touching history (e.g. loading fresh server data). */
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Ends the current coalescing group, so the next edit starts a fresh undo
   * entry. Call on blur — otherwise typing the same field again within the
   * group window would fold into the previous step.
   */
  breakGroup: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Number of committed edits — used to detect unsaved changes. */
  revision: number;
}

interface History<T> {
  past: T[];
  present: T;
  future: T[];
  revision: number;
}

export function useUndoableState<T>(
  initial: T,
  { limit = 100, groupWindowMs = 700 }: { limit?: number; groupWindowMs?: number } = {},
): UndoableState<T> {
  const [history, setHistory] = useState<History<T>>({
    past: [],
    present: initial,
    future: [],
    revision: 0,
  });

  // Coalescing bookkeeping — a ref so it never triggers a re-render.
  const lastGroup = useRef<{ key: string; at: number } | null>(null);

  const set = useCallback(
    (updater: T | ((previous: T) => T), groupKey?: string) => {
      setHistory((current) => {
        const next =
          typeof updater === 'function'
            ? (updater as (previous: T) => T)(current.present)
            : updater;

        // No-op edits (e.g. onChange firing with the same string) must not
        // create history entries, or undo appears to do nothing.
        if (Object.is(next, current.present)) return current;

        const now = Date.now();
        const previousGroup = lastGroup.current;
        const coalesce =
          groupKey !== undefined &&
          previousGroup !== null &&
          previousGroup.key === groupKey &&
          now - previousGroup.at < groupWindowMs;

        lastGroup.current = groupKey === undefined ? null : { key: groupKey, at: now };

        if (coalesce) {
          // Same field, still typing: replace present, leave history alone.
          return { ...current, present: next, future: [], revision: current.revision + 1 };
        }

        const past = [...current.past, current.present].slice(-limit);
        return { past, present: next, future: [], revision: current.revision + 1 };
      });
    },
    [groupWindowMs, limit],
  );

  const reset = useCallback((value: T) => {
    lastGroup.current = null;
    setHistory({ past: [], present: value, future: [], revision: 0 });
  }, []);

  const undo = useCallback(() => {
    lastGroup.current = null;
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (previous === undefined) return current;

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
        revision: current.revision + 1,
      };
    });
  }, []);

  const breakGroup = useCallback(() => {
    lastGroup.current = null;
  }, []);

  const redo = useCallback(() => {
    lastGroup.current = null;
    setHistory((current) => {
      const [next, ...rest] = current.future;
      if (next === undefined) return current;

      return {
        past: [...current.past, current.present].slice(-limit),
        present: next,
        future: rest,
        revision: current.revision + 1,
      };
    });
  }, [limit]);

  return {
    value: history.present,
    set,
    reset,
    undo,
    redo,
    breakGroup,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    revision: history.revision,
  };
}
