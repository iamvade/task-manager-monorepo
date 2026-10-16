import { useCallback, useSyncExternalStore } from 'react';

export interface ViewportBox {
  /** Visible height in CSS px (shrinks while the on-screen keyboard is up). */
  height: number;
  /** How far the visible area is scrolled down inside the layout viewport. */
  offsetTop: number;
}

/** A primitive snapshot ("height:offsetTop"), so unchanged values don't re-render. */
const snapshot = () => {
  const vv = window.visualViewport;
  return vv ? `${String(vv.height)}:${String(vv.offsetTop)}` : `${String(window.innerHeight)}:0`;
};

/**
 * The part of the page the person can see. A full-screen layout sized to it keeps its
 * bottom bar above the on-screen keyboard (iOS Safari and Chrome only shrink the visual
 * viewport). `enabled: false` stops listening and returns null.
 */
export function useVisualViewport(enabled = true): ViewportBox | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => undefined;
      const target: EventTarget = window.visualViewport ?? window;
      target.addEventListener('resize', onChange);
      target.addEventListener('scroll', onChange);
      return () => {
        target.removeEventListener('resize', onChange);
        target.removeEventListener('scroll', onChange);
      };
    },
    [enabled],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => (enabled ? snapshot() : ''),
    () => '',
  );
  if (!value) return null;
  const [height = 0, offsetTop = 0] = value.split(':').map(Number);
  return { height, offsetTop };
}
