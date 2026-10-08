import { describe, expect, it } from 'vitest';
import { addDays, todayInZone } from './dates.js';

describe('todayInZone', () => {
  it('uses the zone, not UTC', () => {
    // 2026-10-07 17:30 UTC is already Oct 8 in Ulaanbaatar (UTC+8).
    const now = new Date('2026-10-07T17:30:00Z');
    expect(todayInZone('Asia/Ulaanbaatar', now)).toBe('2026-10-08');
    expect(todayInZone('UTC', now)).toBe('2026-10-07');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-08', -8)).toBe('2026-09-30');
  });
});
