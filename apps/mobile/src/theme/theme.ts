import { accentTokens, type Accent } from '@kite/shared';
import { fontFor } from './fonts';
import {
  mobileDark,
  mobileLight,
  radii,
  shadowsDark,
  shadowsLight,
  sizes,
  type,
  type MobileColorName,
  type ShadowName,
} from './mobile';
import { PALETTE } from './palette';
import { darkOverrides, lightTokens, type TokenName } from './tokens';

export type ColorScheme = 'light' | 'dark';

/** The tokens.css variables that are `var(--accent…)` chains or set from the accent. */
type AccentTokenName =
  | 'accent'
  | 'accentInk'
  | 'accentSoft'
  | 'statusReview'
  | 'tintReviewBg'
  | 'tintReviewFg'
  | 'waitReview'
  | 'sprintCommitted'
  | 'sprintCompleted';

export type ThemeColors = Record<TokenName | AccentTokenName, string>;

export interface Theme {
  scheme: ColorScheme;
  accent: Accent;
  /** Web tokens (tokens.css), resolved for this scheme and accent. */
  colors: ThemeColors;
  /** Phone-only colors (mobile.ts) plus the accent-derived toast action. */
  mobile: Record<MobileColorName | 'toastAction', string>;
  shadows: Record<ShadowName, string>;
  palette: typeof PALETTE;
  type: typeof type;
  radii: typeof radii;
  sizes: typeof sizes;
  fontFor: typeof fontFor;
}

/** Same chain as tokens.css: light uses the accent, dark the accent ink for status/wait review. */
function accentColors(scheme: ColorScheme, accent: Accent): Record<AccentTokenName, string> {
  const t = accentTokens(accent);
  const dark = scheme === 'dark';
  const ink = dark ? t.accentInkDark : t.accentInkLight;
  const soft = dark ? t.accentSoftDark : t.accentSoftLight;
  return {
    accent: t.accent,
    accentInk: ink,
    accentSoft: soft,
    statusReview: dark ? ink : t.accent,
    tintReviewBg: soft,
    tintReviewFg: ink,
    waitReview: dark ? ink : t.accent,
    sprintCommitted: dark ? t.sprintCommittedDark : t.sprintCommittedLight,
    sprintCompleted: dark ? t.sprintCompletedDark : t.sprintCompletedLight,
  };
}

const cache = new Map<string, Theme>();

/** The full theme for a scheme and accent (memoized: 2 schemes × 4 accents). */
export function buildTheme(scheme: ColorScheme, accent: Accent): Theme {
  const cacheKey = `${scheme}:${accent}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const dark = scheme === 'dark';
  const accents = accentColors(scheme, accent);
  const theme: Theme = {
    scheme,
    accent,
    colors: { ...lightTokens, ...(dark ? darkOverrides : {}), ...accents },
    mobile: {
      ...(dark ? mobileDark : mobileLight),
      // MobileFoundations: the toast (inverted surface) uses the dark ink in light, the accent in dark.
      toastAction: dark ? accent : accentTokens(accent).accentInkDark,
    },
    shadows: dark ? shadowsDark : shadowsLight,
    palette: PALETTE,
    type,
    radii,
    sizes,
    fontFor,
  };
  cache.set(cacheKey, theme);
  return theme;
}
