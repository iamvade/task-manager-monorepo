import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, startOfWeek, todayInZone, weekdayIndex } from './dates.js';

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

describe('weeks', () => {
  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-08')).toBe(3); // Thursday
    expect(weekdayIndex('2026-10-11')).toBe(6); // Sunday
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-10-08')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-06', '2026-10-08')).toBe(2);
    expect(daysBetween('2026-10-08', '2026-10-06')).toBe(-2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
