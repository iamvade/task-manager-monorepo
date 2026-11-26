import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV, moveNav, normalizeNav } from './navItems';

describe('normalizeNav', () => {
  it('falls back to the defaults (Personal and Standup shown, the rest hidden)', () => {
    expect(normalizeNav(undefined)).toEqual(DEFAULT_NAV);
    expect(normalizeNav('junk')).toEqual(DEFAULT_NAV);
    expect(DEFAULT_NAV.filter((p) => p.shown).map((p) => p.key)).toEqual(['personal', 'standup']);
  });

  it('puts links missing from an older saved list back at their default place, shown as default', () => {
    expect(
      normalizeNav([
        { key: 'reports', shown: true },
        { key: 'outlook', shown: false },
        { key: 'feedback', shown: false },
      ]),
    ).toEqual([
      { key: 'personal', shown: true },
      { key: 'standup', shown: true },
      { key: 'reports', shown: true },
      { key: 'outlook', shown: false },
      { key: 'feedback', shown: false },
    ]);
  });

  it('keeps Personal and Standup hidden once the user hid them', () => {
    expect(
      normalizeNav([
        { key: 'standup', shown: false },
        { key: 'personal', shown: false },
      ]).slice(0, 2),
    ).toEqual([
      { key: 'standup', shown: false },
      { key: 'personal', shown: false },
    ]);
  });

  it('keeps the saved order, drops fixed/unknown/duplicate keys and adds missing ones', () => {
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
      { key: 'personal', shown: true },
      { key: 'standup', shown: true },
      { key: 'reports', shown: true },
      { key: 'feedback', shown: false },
      { key: 'outlook', shown: false },
    ]);
  });
});

describe('moveNav', () => {
  it('swaps with a neighbor and ignores moves past the ends', () => {
    const keys = ['personal', 'standup', 'outlook', 'feedback', 'reports'];
    expect(moveNav(DEFAULT_NAV, 0, 1).map((p) => p.key)).toEqual([
      'standup',
      'personal',
      'outlook',
      'feedback',
      'reports',
    ]);
    expect(moveNav(DEFAULT_NAV, 0, -1).map((p) => p.key)).toEqual(keys);
    expect(moveNav(DEFAULT_NAV, 4, 1).map((p) => p.key)).toEqual(keys);
  });
});
