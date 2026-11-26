import { useLayoutEffect, useState, type RefObject } from 'react';

/** List column of the split inbox. */
export const INBOX_LIST_WIDTH = 440;
/** The task detail's minimum width (the drawer's, `Drawer.tsx`). */
const PANE_MIN_WIDTH = 520;

/**
 * Whether the inbox has room for the list and the side pane next to each other. Measured on
 * the page itself, not the viewport: the sidebar is resizable and collapsible. Below that the
 * inbox keeps the overlay drawer.
 */
export function useInboxSplit(ref: RefObject<HTMLElement | null>): boolean {
  const [split, setSplit] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setSplit(el.clientWidth >= INBOX_LIST_WIDTH + PANE_MIN_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return split;
}
