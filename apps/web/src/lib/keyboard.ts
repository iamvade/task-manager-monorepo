/**
 * Whether a key event target is somewhere typing happens (inputs, editors). With
 * `overlays`, anything inside a dialog, menu or listbox counts too (list j/k/x stay out of them).
 */
export function isEditableTarget(target: EventTarget | null, overlays = false): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    return true;
  }
  return overlays && Boolean(target.closest('[role="dialog"], [role="menu"], [role="listbox"]'));
}

export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform's command modifier as shown in keyboard hints. */
export const modKey = isMac ? '⌘' : 'Ctrl';

/** ⌘ or Ctrl held (either works on every platform, like the editor's Mod-Enter). */
export const hasMod = (event: { metaKey: boolean; ctrlKey: boolean }) =>
  event.metaKey || event.ctrlKey;
