import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, kept in sync (false where `matchMedia` is missing). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone width (StandupWriteMobile.dc.html is used below 640px). The rest is desktop-first. */
export const NARROW_QUERY = '(max-width: 639px)';

export const useIsNarrow = () => useMediaQuery(NARROW_QUERY);
