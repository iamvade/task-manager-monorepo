import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV, normalizeNav, reorderNav, visibilitiesFor } from './navItems';

const keys = (prefs: { key: string }[]) => prefs.map((p) => p.key);

describe('normalizeNav', () => {
  it('falls back to the defaults (Personal and Standup always shown, the rest hidden)', () => {
    expect(normalizeNav(undefined)).toEqual(DEFAULT_NAV);
    expect(normalizeNav('junk')).toEqual(DEFAULT_NAV);
    expect(keys(DEFAULT_NAV.filter((p) => p.visibility === 'always'))).toEqual([
      'personal',
      'standup',
    ]);
  });

  it("reads lists saved with `shown: boolean` as Always show / Don't show", () => {
    expect(
      normalizeNav([
        { key: 'reports', shown: true },
        { key: 'outlook', shown: false },
        { key: 'feedback', shown: false },
      ]),
    ).toEqual([
      { key: 'personal', visibility: 'always' },
      { key: 'standup', visibility: 'always' },
      { key: 'reports', visibility: 'always' },
      { key: 'outlook', visibility: 'hidden' },
      { key: 'feedback', visibility: 'hidden' },
    ]);
  });

  it('keeps "Show when badged" only for links that can have a badge', () => {
    expect(
      normalizeNav([
        { key: 'feedback', visibility: 'badged' },
        { key: 'reports', visibility: 'badged' },
        { key: 'standup', visibility: 'badged' },
      ]).filter((p) => p.key !== 'personal' && p.key !== 'outlook'),
    ).toEqual([
      { key: 'feedback', visibility: 'badged' },
      { key: 'reports', visibility: 'hidden' },
      { key: 'standup', visibility: 'badged' },
    ]);
    expect(visibilitiesFor('feedback')).toEqual(['always', 'badged', 'hidden']);
    expect(visibilitiesFor('reports')).toEqual(['always', 'hidden']);
  });

  it('keeps the saved order, drops fixed/unknown/duplicate keys and adds missing ones', () => {
    expect(
      normalizeNav([
        { key: 'reports', visibility: 'always' },
        { key: 'inbox', visibility: 'hidden' },
        { key: 'nope', visibility: 'always' },
        { key: 'reports', visibility: 'hidden' },
        null,
        { key: 'outlook', visibility: 'yes' },
      ]),
    ).toEqual([
      { key: 'personal', visibility: 'always' },
      { key: 'standup', visibility: 'always' },
      { key: 'reports', visibility: 'always' },
      { key: 'feedback', visibility: 'hidden' },
      { key: 'outlook', visibility: 'hidden' },
    ]);
  });
});

describe('reorderNav', () => {
  it('moves a link to where another one is', () => {
    expect(keys(reorderNav(DEFAULT_NAV, 'reports', 'personal'))).toEqual([
      'reports',
      'personal',
      'standup',
      'outlook',
      'feedback',
    ]);
    expect(keys(reorderNav(DEFAULT_NAV, 'personal', 'outlook'))).toEqual([
      'standup',
      'outlook',
      'personal',
      'feedback',
      'reports',
    ]);
    expect(reorderNav(DEFAULT_NAV, 'personal', 'personal')).toEqual(DEFAULT_NAV);
  });
});
