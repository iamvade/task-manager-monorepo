import { ACCENTS, DEFAULT_ACCENT, PALETTE_KEYS, accentTokens, type Accent } from '@kite/shared';
import { PALETTE, type PaletteFamily } from '../palette';
import { buildTheme, type ColorScheme } from '../theme';
import { camel, normalize, parseCss, resolveVars } from './cssTokens';

/*
 * The mobile theme mirrors apps/web/src/styles/tokens.css and palette.css. When this fails, a web
 * token changed (or a mobile one did): update src/theme/tokens.ts / palette.ts to match.
 */

const tokens = parseCss('tokens.css');
const DARK = ":root[data-theme='dark']";

/** Inputs `applyAppearance` sets from the accent; the theme exposes only their resolved values. */
const ACCENT_INPUTS = new Set([
  'accent-ink-light',
  'accent-ink-dark',
  'accent-soft-light',
  'accent-soft-dark',
  'sprint-committed-light',
  'sprint-completed-light',
  'sprint-committed-dark',
  'sprint-completed-dark',
]);

/** What the browser computes for every variable, with `applyAppearance(…, accent)` applied. */
function cssColors(scheme: ColorScheme, accent: Accent): Map<string, string> {
  const light = tokens.get(':root');
  const dark = tokens.get(DARK);
  if (!light || !dark) throw new Error('tokens.css: missing :root or dark block');
  const t = accentTokens(accent);
  const vars = new Map([...light, ...(scheme === 'dark' ? dark : [])]);
  vars.set('accent', t.accent);
  vars.set('accent-ink-light', t.accentInkLight);
  vars.set('accent-ink-dark', t.accentInkDark);
  vars.set('accent-soft-light', t.accentSoftLight);
  vars.set('accent-soft-dark', t.accentSoftDark);
  vars.set('sprint-committed-light', t.sprintCommittedLight);
  vars.set('sprint-completed-light', t.sprintCompletedLight);
  vars.set('sprint-committed-dark', t.sprintCommittedDark);
  vars.set('sprint-completed-dark', t.sprintCompletedDark);
  const resolved = resolveVars(vars);
  for (const name of ACCENT_INPUTS) resolved.delete(name);
  return new Map([...resolved].map(([name, value]) => [camel(name), normalize(value)]));
}

function mobileColors(scheme: ColorScheme, accent: Accent): Map<string, string> {
  const { colors } = buildTheme(scheme, accent);
  return new Map(Object.entries(colors).map(([name, value]) => [name, normalize(value)]));
}

describe('theme tokens match apps/web/src/styles/tokens.css', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}, default accent`, () => {
      expect(Object.fromEntries(mobileColors(scheme, DEFAULT_ACCENT))).toEqual(
        Object.fromEntries(cssColors(scheme, DEFAULT_ACCENT)),
      );
    });

    it.each(ACCENTS.filter((a) => a !== DEFAULT_ACCENT))(`${scheme}, accent %s`, (accent) => {
      expect(Object.fromEntries(mobileColors(scheme, accent))).toEqual(
        Object.fromEntries(cssColors(scheme, accent)),
      );
    });
  }
});

describe('palette matches apps/web/src/styles/palette.css', () => {
  const palette = parseCss('palette.css');
  const families = Object.keys(PALETTE) as PaletteFamily[];

  it('covers every family and key the CSS has', () => {
    const selectors = [...palette.keys()].filter(
      (s) => s.startsWith('.pal-') && s.split('-').length === 3,
    );
    const css = selectors.map((s) => s.slice('.pal-'.length)).sort();
    const mobile = families.flatMap((f) => PALETTE_KEYS.map((k) => `${f}-${k}`)).sort();
    expect(mobile).toEqual(css);
  });

  for (const family of families) {
    it(family, () => {
      for (const key of PALETTE_KEYS) {
        for (const scheme of ['light', 'dark'] as const) {
          const selector = `${scheme === 'dark' ? `${DARK} ` : ''}.pal-${family}-${key}`;
          const decls = palette.get(selector);
          if (!decls) throw new Error(`palette.css has no ${selector}`);
          const css = Object.fromEntries(
            [...decls].map(([name, value]) => [name.replace(/^p-/, ''), normalize(value)]),
          );
          const mobile = Object.fromEntries(
            Object.entries<string>({ ...PALETTE[family][key][scheme] }).map(([name, value]) => [
              name,
              normalize(value),
            ]),
          );
          expect({ selector, ...mobile }).toEqual({ selector, ...css });
        }
      }
    });
  }
});
