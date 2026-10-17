import { useCallback, useSyncExternalStore } from 'react';

/** Phone layout breakpoint (Tailwind `sm` starts at 640px). */
export const NARROW_QUERY = '(max-width: 640px)';

const supported = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsNarrow = (): boolean => useMediaQuery(NARROW_QUERY);
