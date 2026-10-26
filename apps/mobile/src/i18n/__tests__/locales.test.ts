import webEn from '../../../../web/src/i18n/locales/en.json';
import webMn from '../../../../web/src/i18n/locales/mn.json';
import { initialLocale } from '..';
import en from '../locales/en.json';
import mn from '../locales/mn.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function get(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) =>
        typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[k] : undefined,
      obj,
    );
}

function vars(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '').sort();
}

describe('locales', () => {
  it('mn and en have the same keys', () => {
    expect(keys(mn).sort()).toEqual(keys(en).sort());
  });

  it('use the same interpolation variables', () => {
    for (const key of keys(en)) {
      const a = get(en, key);
      const b = get(mn, key);
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      expect([key, vars(b)]).toEqual([key, vars(a)]);
    }
  });

  // A key that exists on the web means "the same string": copy changes go to both apps together.
  // Mobile-only wording gets its own key (docs/i18n-review.md lists them).
  it.each([
    ['mn', mn, webMn],
    ['en', en, webEn],
  ] as const)('%s copies web strings verbatim', (_, mobile, web) => {
    for (const key of keys(mobile)) {
      const webValue = get(web, key);
      if (webValue === undefined) continue;
      expect([key, get(mobile, key)]).toEqual([key, webValue]);
    }
  });
});

describe('initialLocale', () => {
  it('picks the first device language the app speaks', () => {
    expect(initialLocale([{ languageCode: 'en' }, { languageCode: 'mn' }])).toBe('en');
    expect(initialLocale([{ languageCode: 'ru' }, { languageCode: 'mn' }])).toBe('mn');
  });

  it('falls back to Mongolian', () => {
    expect(initialLocale([{ languageCode: 'ru' }])).toBe('mn');
    expect(initialLocale([{ languageCode: null }])).toBe('mn');
    expect(initialLocale([])).toBe('mn');
  });
});
