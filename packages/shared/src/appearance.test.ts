import { describe, expect, it } from 'vitest';
import { accentTokens } from './appearance.js';

describe('accentTokens', () => {
  it('uses the drawn sprint tints for the default accent', () => {
    expect(accentTokens('#6E56CF')).toEqual({
      accent: '#6E56CF',
      accentInkLight: '#6C55CC',
      accentInkDark: '#B4A5FF',
      accentSoftLight: '#6E56CF1A',
      accentSoftDark: '#6E56CF33',
      sprintCommittedLight: '#9C8BE3',
      sprintCompletedLight: '#5B45B8',
      sprintCommittedDark: '#B4A5FF73',
      sprintCompletedDark: '#B4A5FF',
    });
  });

  it('derives sprint tints from other accents', () => {
    const t = accentTokens('#2F6FEB');
    expect(t.sprintCommittedLight).toBe('#2F6FEB73');
    expect(t.sprintCompletedLight).toBe('#2F6FEB');
    expect(t.sprintCommittedDark).toBe('#93B4FF73');
  });
});
