import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import mn from './locales/mn.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

// Date templates get every date part; each locale picks the ones it needs.
// (`start`/`end` prefixed in ranges, e.g. startDay, endMonthShort).
const DATE_PART = /^(start|end)?(m|d|day|year|month(short|long)?|weekday(short|long)?)$/i;
const DATE_PARTS = { has: (v: string) => DATE_PART.test(v) };

function vars(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '').sort();
}

describe('locales', () => {
  it('mn and en have the same keys', () => {
    expect(keys(mn).sort()).toEqual(keys(en).sort());
  });

  it('use the same interpolation variables (date templates aside)', () => {
    const get = (obj: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
    for (const key of keys(en)) {
      const a = get(en, key);
      const b = get(mn, key);
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      // Mongolian may drop the redundant {{project}} in views.notYet (as in Main.dc.html STR.mn).
      if (key === 'views.notYet') continue;
      const isDateTemplate = [...vars(a), ...vars(b)].some((v) => DATE_PARTS.has(v));
      if (isDateTemplate) {
        expect(
          vars(b).filter((v) => !DATE_PARTS.has(v)),
          key,
        ).toEqual(vars(a).filter((v) => !DATE_PARTS.has(v)));
        continue;
      }
      expect(vars(b), key).toEqual(vars(a));
    }
  });
});
