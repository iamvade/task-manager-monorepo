import type { Notification } from '@kite/shared';
import { useEffect, useRef } from 'react';
import { hasMod, isEditableTarget } from '../../lib/keyboard';

interface InboxKeys {
  /** Only while the side pane is shown. */
  enabled: boolean;
  items: readonly Notification[];
  selectedId: string | null;
  /** ↑/↓, J/K: select (and open) another row. */
  onMove: (n: Notification) => void;
  /** E: archive (on Archived: move back to the inbox). */
  onArchive: (n: Notification) => void;
  /** U: mark read / unread. */
  onToggleRead: (n: Notification) => void;
}

/** Puts focus on a row's button and scrolls it into view (after React has re-rendered). */
function focusRow(id: string) {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      `[data-notification-id="${CSS.escape(id)}"] > button`,
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  });
}

/**
 * Inbox triage keys in the split view. Ignored while typing (comment composer, title,
 * pickers) and while a dialog, menu or listbox has focus, or a modal/drawer is open.
 */
export function useInboxKeys(keys: InboxKeys) {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  const { enabled } = keys;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || hasMod(event)) return;
      if (isEditableTarget(event.target, true)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const { items, selectedId, onMove, onArchive, onToggleRead } = latest.current;
      if (items.length === 0) return;
      const index = items.findIndex((n) => n.id === selectedId);
      const current = index >= 0 ? items[index] : undefined;
      const key = event.key.toLowerCase();

      const arrow = key === 'arrowdown' || key === 'arrowup';
      // Inside the pane ↑/↓ belong to scrolling and its own widgets; J/K still move.
      if (arrow && event.target instanceof Element && event.target.closest('[data-inbox-pane]')) {
        return;
      }
      if (arrow || key === 'j' || key === 'k') {
        const down = key === 'arrowdown' || key === 'j';
        const next =
          index < 0
            ? items[0]
            : items[down ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0)];
        event.preventDefault();
        if (next && next.id !== selectedId) {
          onMove(next);
          focusRow(next.id);
        }
        return;
      }
      if (!current) return;
      if (key === 'e') {
        event.preventDefault();
        onArchive(current);
        // The neighbor that took its place gets focus (the archived row is gone).
        const neighbor = items[index + 1] ?? items[index - 1];
        if (neighbor) focusRow(neighbor.id);
      } else if (key === 'u') {
        event.preventDefault();
        onToggleRead(current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
