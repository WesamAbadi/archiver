import { useEffect, useState } from 'react';

/**
 * Debounce a value.
 *
 * Used by search so a keystroke doesn't become a request. The timer is cleared
 * on every change and on unmount, so a component that unmounts mid-type can't
 * leave a pending state update behind.
 *
 * `delay = 0` passes the value straight through, which is useful in tests and
 * when the caller wants to disable debouncing without branching.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
