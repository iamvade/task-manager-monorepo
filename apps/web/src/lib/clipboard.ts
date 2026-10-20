/**
 * Copies text to the clipboard. `navigator.clipboard` exists only in a secure context (https or
 * localhost), so over plain http (a LAN address, a server without TLS) this falls back to a hidden
 * textarea and `execCommand('copy')`. Rejects when neither works.
 */
export async function copyText(text: string): Promise<void> {
  // Typed as always present, but undefined outside a secure context.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (window.isSecureContext && clipboard) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Permission denied or the document lost focus: try the fallback.
    }
  }
  copyWithTextarea(text);
}

function copyWithTextarea(text: string) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  // Inside the open dialog/popover, so its focus trap doesn't pull focus back mid-copy.
  const host = previous?.closest<HTMLElement>('[role="dialog"]') ?? document.body;
  host.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    // Deprecated, but the only way to copy where `navigator.clipboard` doesn't exist.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
  } finally {
    textarea.remove();
    previous?.focus({ preventScroll: true });
  }
}
