import { describe, expect, it } from 'vitest';
import { createClock } from '../src/db/seed/dates.js';

describe('createClock', () => {
  it('maps design dates 1:1 on the design day', () => {
    const clock = createClock('2026-10-08', new Date('2026-10-08T02:00:00Z'));
    expect(clock.day([10, 8])).toBe('2026-10-08');
    expect(clock.day([11, 3])).toBe('2026-11-03');
    expect(clock.at([10, 7, '16:12']).toISOString()).toBe('2026-10-07T08:12:00.000Z');
    expect(clock.at({ hoursAgo: 2 }).toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('shifts every date by the distance from the design day', () => {
    // 2027-01-05 08:30 in Ulaanbaatar.
    const clock = createClock(undefined, new Date('2027-01-05T00:30:00Z'));
    expect(clock.today).toBe('2027-01-05');
    expect(clock.day([10, 8])).toBe('2027-01-05');
    expect(clock.day([10, 7])).toBe('2027-01-04');
    expect(clock.day([9, 29])).toBe('2026-12-27');
    expect(clock.startOfYesterday.toISOString()).toBe('2027-01-03T16:00:00.000Z');
  });

  it('uses the Ulaanbaatar date, not UTC', () => {
    // 2026-10-08 23:30 UTC is already Oct 9 in Ulaanbaatar.
    expect(createClock(undefined, new Date('2026-10-08T23:30:00Z')).today).toBe('2026-10-09');
  });
});
