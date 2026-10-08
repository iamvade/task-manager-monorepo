import { LOCALES, type Accent, type Locale, type Theme } from '@kite/shared';

const LANGUAGE_KEY = 'kite.language';

/** Accent ink (accent used as text/outline) on dark backgrounds, per accent. */
const ACCENT_INK_DARK: Record<Accent, string> = {
  '#6E56CF': '#B4A5FF',
  '#2F6FEB': '#93B4FF',
  '#0F766E': '#5EEAD4',
  '#3F3F46': '#D4D4D8',
};

/** Language picked before sign-in (on /login), remembered per browser. */
export function getStoredLanguage(): Locale | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return LOCALES.find((l) => l === value) ?? null;
  } catch {
    return null;
  }
}

export function storeLanguage(locale: Locale): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
}

let stopFollowingSystem: (() => void) | undefined;

/** Sets `data-theme` and the accent variables on <html>; `system` follows the OS setting live. */
export function applyAppearance(theme: Theme, accent: Accent): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink-dark', ACCENT_INK_DARK[accent]);

  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  if (theme !== 'system') {
    root.dataset.theme = theme;
    return;
  }
  // jsdom (tests) has no matchMedia.
  if (typeof window.matchMedia !== 'function') {
    root.dataset.theme = 'light';
    return;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    root.dataset.theme = query.matches ? 'dark' : 'light';
  };
  sync();
  query.addEventListener('change', sync);
  stopFollowingSystem = () => {
    query.removeEventListener('change', sync);
  };
}
