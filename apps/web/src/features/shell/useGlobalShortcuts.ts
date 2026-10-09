import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { hasMod, isEditableTarget } from '../../lib/keyboard';
import { useUiStore } from '../../stores/ui';

/** How long the second key of a `G` chord may take. */
const CHORD_MS = 1000;

const GO_TO: Record<string, string> = { i: '/inbox', m: '/my-tasks' };

/**
 * App-wide keys: ⌘K / Ctrl+K palette (even while typing), `C` new task, `?` shortcuts help,
 * `G` then `I` Inbox, `G` then `M` My Tasks. Single keys are ignored while typing, inside
 * menus/pickers, and while one of the shell's dialogs is open. Esc belongs to each overlay.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let chordAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      const ui = useUiStore.getState();
      if (event.key.toLowerCase() === 'k' && hasMod(event) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (!ui.createOpen) ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (ui.createOpen || ui.paletteOpen || ui.shortcutsOpen) return;
      if (isEditableTarget(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"]')
      )
        return;

      const key = event.key.toLowerCase();
      const chord = chordAt > 0 && Date.now() - chordAt < CHORD_MS;
      chordAt = 0;
      if (chord) {
        const path = GO_TO[key];
        if (path) {
          event.preventDefault();
          void navigate(path);
        }
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        ui.setShortcutsOpen(true);
        return;
      }
      if (event.shiftKey) return;
      if (key === 'g') {
        chordAt = Date.now();
      } else if (key === 'c') {
        event.preventDefault();
        ui.openCreate();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate]);
}
