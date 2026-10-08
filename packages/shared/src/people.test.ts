import { describe, expect, it } from 'vitest';
import { shortName } from './people.js';

describe('shortName', () => {
  it('abbreviates the last name', () => {
    expect(shortName('Anu Bold')).toBe('Anu B.');
    expect(shortName('Ану Болд')).toBe('Ану Б.');
  });

  it('keeps short and single names', () => {
    expect(shortName('Sara K.')).toBe('Sara K.');
    expect(shortName('Bat')).toBe('Bat');
  });
});
