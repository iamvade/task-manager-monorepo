import type { Accent } from './enums.js';

/** The accent new accounts start with. */
export const DEFAULT_ACCENT: Accent = '#6E56CF';

/**
 * Accent ink (accent used as text/outline) on light backgrounds: the accent, nudged darker where
 * it would miss 4.5:1 on accent-soft over the sidebar background (axe, WCAG AA).
 */
export const ACCENT_INK_LIGHT: Record<Accent, string> = {
  '#6E56CF': '#6C55CC',
  '#2F6FEB': '#2A63D2',
  '#0F766E': '#0F756D',
  '#3F3F46': '#3F3F46',
};

/** Accent ink (accent used as text/outline) on dark backgrounds, per accent. */
export const ACCENT_INK_DARK: Record<Accent, string> = {
  '#6E56CF': '#B4A5FF',
  '#2F6FEB': '#93B4FF',
  '#0F766E': '#5EEAD4',
  '#3F3F46': '#D4D4D8',
};

/** The accent-derived colors of one theme (web: the `--accent*` and `--sprint-*` variables). */
export interface AccentTokens {
  accent: Accent;
  accentInkLight: string;
  accentInkDark: string;
  accentSoftLight: string;
  accentSoftDark: string;
  sprintCommittedLight: string;
  sprintCompletedLight: string;
  sprintCommittedDark: string;
  sprintCompletedDark: string;
}

/** Derives every accent-dependent color from the user's accent (web `applyAppearance`, mobile theme). */
export function accentTokens(accent: Accent): AccentTokens {
  const inkDark = ACCENT_INK_DARK[accent];
  // Sprint chart (ReportsSprints.dc.html): the default accent has its own tints, others use the
  // accent at 45% (`+ '73'`) for committed and solid for completed; dark uses the accent ink.
  const isDefault = accent === DEFAULT_ACCENT;
  return {
    accent,
    accentInkLight: ACCENT_INK_LIGHT[accent],
    accentInkDark: inkDark,
    // accent at 10% (light) / 20% (dark), as hex alpha like the designs (`accent + '1A'`).
    accentSoftLight: `${accent}1A`,
    accentSoftDark: `${accent}33`,
    sprintCommittedLight: isDefault ? '#9C8BE3' : `${accent}73`,
    sprintCompletedLight: isDefault ? '#5B45B8' : accent,
    sprintCommittedDark: `${inkDark}73`,
    sprintCompletedDark: inkDark,
  };
}
