import { describe, expect, it } from 'vitest';
import { dueTone, formatDate, formatRange, relativeDay, todayFor } from './dates';

// Thursday, like the designs.
const TODAY = '2026-10-08';

describe('dueTone', () => {
  it('classifies relative to today and the current Mon–Sun week', () => {
    expect(dueTone('2026-10-07', TODAY)).toBe('overdue');
    expect(dueTone('2026-10-08', TODAY)).toBe('today');
    expect(dueTone('2026-10-09', TODAY)).toBe('soon');
    expect(dueTone('2026-10-11', TODAY)).toBe('soon'); // Sunday
    expect(dueTone('2026-10-12', TODAY)).toBe('later'); // next Monday
    expect(dueTone('2026-10-07', TODAY, true)).toBe('done');
  });

  it('treats tomorrow as soon even on a Sunday', () => {
    expect(dueTone('2026-10-12', '2026-10-11')).toBe('soon');
    expect(dueTone('2026-10-13', '2026-10-11')).toBe('later');
  });
});

describe('formatDate', () => {
  it('formats like the designs', () => {
    expect(formatDate('2026-10-14', 'en', TODAY)).toBe('Oct 14');
    expect(formatDate('2026-10-14', 'mn', TODAY)).toBe('10-р сарын 14');
    expect(formatDate('2026-09-29', 'mn', TODAY)).toBe('9-р сарын 29');
  });

  it('adds the year outside the current year', () => {
    expect(formatDate('2027-01-05', 'en', TODAY)).toBe('Jan 5, 2027');
    expect(formatDate('2027-01-05', 'mn', TODAY)).toBe('2027 оны 1-р сарын 5');
  });
});

describe('formatRange', () => {
  it('matches the sprint chip', () => {
    expect(formatRange('2026-10-06', '2026-10-24', 'en', TODAY)).toBe('Oct 6 – Oct 24');
    expect(formatRange('2026-10-06', '2026-10-24', 'mn', TODAY)).toBe('10-р сарын 6 – 24');
    expect(formatRange('2026-09-29', '2026-10-03', 'mn', TODAY)).toBe(
      '9-р сарын 29 – 10-р сарын 3',
    );
  });
});

describe('relativeDay / todayFor', () => {
  it('names neighbors of today', () => {
    expect(relativeDay('2026-10-09', TODAY)).toBe('tomorrow');
    expect(relativeDay('2026-10-07', TODAY)).toBe('yesterday');
    expect(relativeDay('2026-10-10', TODAY)).toBeNull();
  });

  it('computes today in the user zone', () => {
    // 2026-10-08 20:00 UTC is already Oct 9 in Ulaanbaatar (UTC+8).
    const now = new Date('2026-10-08T20:00:00Z');
    expect(todayFor('Asia/Ulaanbaatar', now)).toBe('2026-10-09');
    expect(todayFor('America/New_York', now)).toBe('2026-10-08');
    expect(todayFor('Not/AZone', now)).toBe('2026-10-09');
  });
});
