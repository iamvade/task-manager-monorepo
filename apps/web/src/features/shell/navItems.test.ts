import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV, moveNav, normalizeNav } from './navItems';

describe('normalizeNav', () => {
  it('falls back to the defaults (all optional links hidden)', () => {
    expect(normalizeNav(undefined)).toEqual(DEFAULT_NAV);
    expect(normalizeNav('junk')).toEqual(DEFAULT_NAV);
  });

  it('keeps the saved order, drops fixed/unknown/duplicate keys and appends missing ones', () => {
    expect(
      normalizeNav([
        { key: 'reports', shown: true },
        { key: 'inbox', shown: false },
        { key: 'nope', shown: true },
        { key: 'reports', shown: false },
        null,
        { key: 'outlook', shown: 'yes' },
      ]),
    ).toEqual([
      { key: 'reports', shown: true },
      { key: 'outlook', shown: false },
      { key: 'feedback', shown: false },
    ]);
  });
});

describe('moveNav', () => {
  it('swaps with a neighbor and ignores moves past the ends', () => {
    expect(moveNav(DEFAULT_NAV, 0, 1).map((p) => p.key)).toEqual([
      'feedback',
      'outlook',
      'reports',
    ]);
    expect(moveNav(DEFAULT_NAV, 0, -1).map((p) => p.key)).toEqual([
      'outlook',
      'feedback',
      'reports',
    ]);
    expect(moveNav(DEFAULT_NAV, 2, 1).map((p) => p.key)).toEqual([
      'outlook',
      'feedback',
      'reports',
    ]);
  });
});
