import { describe, expect, it } from 'vitest';
import {
  projectKeyCandidates,
  projectKeySchema,
  suggestProjectKey,
  transliterate,
} from './project-key.js';

describe('suggestProjectKey', () => {
  it('abbreviates a single word', () => {
    expect(suggestProjectKey('App')).toBe('APP');
    expect(suggestProjectKey('Partner')).toBe('PRT');
    expect(suggestProjectKey('Go')).toBe('GO');
  });

  it('uses initials for several words', () => {
    expect(suggestProjectKey('App Redesign')).toBe('AR');
    expect(suggestProjectKey('Mobile release 4.2')).toBe('MR');
    expect(suggestProjectKey('One two three four five')).toBe('OTTF');
  });

  it('transliterates Mongolian names', () => {
    expect(transliterate('Апп шинэчлэл')).toBe('APP SINECLEL');
    expect(suggestProjectKey('Апп шинэчлэл')).toBe('AS');
    expect(suggestProjectKey('Өдөр')).toBe('ODR');
    expect(suggestProjectKey('Брэнд')).toBe('BRN');
  });

  it('falls back when a name has no letters', () => {
    expect(suggestProjectKey('🚀 2026')).toBe('PRJ');
    expect(suggestProjectKey('X')).toBe('XX');
  });
});

describe('projectKeyCandidates', () => {
  it('offers unique 2–4 letter keys, best first', () => {
    const keys = projectKeyCandidates('Partner Portal');
    expect(keys.slice(0, 3)).toEqual(['PP', 'PPO', 'PPOR']);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(500);
    expect(keys.every((k) => /^[A-Z]{2,4}$/.test(k))).toBe(true);
  });
});

describe('projectKeySchema', () => {
  it('normalizes and validates', () => {
    expect(projectKeySchema.parse(' app ')).toBe('APP');
    expect(projectKeySchema.parse('Q4')).toBe('Q4');
    expect(projectKeySchema.safeParse('4Q').success).toBe(false);
    expect(projectKeySchema.safeParse('A').success).toBe(false);
    expect(projectKeySchema.safeParse('APP-1').success).toBe(false);
  });
});
