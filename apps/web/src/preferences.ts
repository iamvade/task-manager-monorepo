import { LOCALES, accentTokens, type Accent, type Locale, type Theme } from '@kite/shared';

const LANGUAGE_KEY = 'kite.language';
/** Read by the inline script in index.html to paint the right theme before React starts. */
const APPEARANCE_KEY = 'kite.appearance';

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
  const tokens = accentTokens(accent);
  root.style.setProperty('--accent', tokens.accent);
  root.style.setProperty('--accent-ink-light', tokens.accentInkLight);
  root.style.setProperty('--accent-ink-dark', tokens.accentInkDark);
  root.style.setProperty('--accent-soft-light', tokens.accentSoftLight);
  root.style.setProperty('--accent-soft-dark', tokens.accentSoftDark);
  root.style.setProperty('--sprint-committed-light', tokens.sprintCommittedLight);
  root.style.setProperty('--sprint-completed-light', tokens.sprintCompletedLight);
  root.style.setProperty('--sprint-committed-dark', tokens.sprintCommittedDark);
  root.style.setProperty('--sprint-completed-dark', tokens.sprintCompletedDark);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme, accent }));
  } catch {
    // Storage unavailable: the next load may flash the default theme once.
  }

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
