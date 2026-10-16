import { describe, expect, it } from 'vitest';
import {
  groupToday,
  isStandupDay,
  nextStandupDay,
  previousStandupDay,
  standupDays,
  utcOffsetLabel,
  zonedTimeToZone,
} from './standup.js';

const UB = 'Asia/Ulaanbaatar';
const weekdays = { days: [0, 1, 2, 3, 4], timezone: UB };
const monWedFri = { days: [0, 2, 4], timezone: UB };
// 2026 Mongolian public holidays used below.
const holidays = new Set(['2026-11-10', '2026-11-26']);

describe('previousStandupDay', () => {
  it('goes from Monday back to Friday', () => {
    expect(previousStandupDay(weekdays, '2026-10-12')).toBe('2026-10-09');
  });

  it('is the calendar day before mid-week', () => {
    expect(previousStandupDay(weekdays, '2026-10-08')).toBe('2026-10-07');
  });

  it('skips a holiday', () => {
    // Tue Nov 10 is Chinggis Khaan's Birthday.
    expect(previousStandupDay(weekdays, '2026-11-11', holidays)).toBe('2026-11-09');
    // Thu Nov 26 is Republic Day.
    expect(previousStandupDay(weekdays, '2026-11-27', holidays)).toBe('2026-11-25');
  });

  it('follows a Mon/Wed/Fri group', () => {
    expect(previousStandupDay(monWedFri, '2026-10-14')).toBe('2026-10-12');
    expect(previousStandupDay(monWedFri, '2026-10-12')).toBe('2026-10-09');
    // A Thursday isn't a standup day, but "yesterday" is still the last one before it.
    expect(previousStandupDay(monWedFri, '2026-10-15')).toBe('2026-10-14');
  });

  it('is null for a group with no days', () => {
    expect(previousStandupDay({ days: [], timezone: UB }, '2026-10-12')).toBeNull();
  });
});

describe('nextStandupDay', () => {
  it('goes from Friday to Monday and over holidays', () => {
    expect(nextStandupDay(weekdays, '2026-10-09')).toBe('2026-10-12');
    expect(nextStandupDay(weekdays, '2026-11-09', holidays)).toBe('2026-11-11');
    expect(nextStandupDay(monWedFri, '2026-10-12')).toBe('2026-10-14');
  });
});

describe('standupDays', () => {
  it('lists the group days in a range, skipping weekends and holidays', () => {
    expect(standupDays(weekdays, '2026-11-06', '2026-11-12', holidays)).toEqual([
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-12',
    ]);
    expect(standupDays(monWedFri, '2026-10-05', '2026-10-11')).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
    ]);
  });

  it('is empty when the range is reversed', () => {
    expect(standupDays(weekdays, '2026-10-12', '2026-10-09')).toEqual([]);
  });

  it('agrees with isStandupDay', () => {
    expect(isStandupDay(weekdays, '2026-10-10')).toBe(false);
    expect(isStandupDay(weekdays, '2026-11-10', holidays)).toBe(false);
    expect(isStandupDay(weekdays, '2026-11-10')).toBe(true);
  });
});

describe('groupToday', () => {
  it("uses the group's timezone", () => {
    // 17:30 UTC on Oct 7 is already Oct 8 in Ulaanbaatar.
    const now = new Date('2026-10-07T17:30:00Z');
    expect(groupToday(weekdays, now)).toBe('2026-10-08');
    expect(groupToday({ timezone: 'UTC' }, now)).toBe('2026-10-07');
  });
});

describe('zonedTimeToZone', () => {
  it('shows a group time in another zone', () => {
    expect(zonedTimeToZone('2026-10-08', '10:00', UB, 'Asia/Seoul')).toEqual({
      date: '2026-10-08',
      time: '11:00',
    });
    expect(zonedTimeToZone('2026-10-08', '06:30', UB, 'UTC')).toEqual({
      date: '2026-10-07',
      time: '22:30',
    });
    expect(zonedTimeToZone('2026-10-08', '09:30', UB, UB)).toEqual({
      date: '2026-10-08',
      time: '09:30',
    });
  });

  it('handles a DST zone', () => {
    // New York is UTC-4 on Oct 8, 2026.
    expect(zonedTimeToZone('2026-10-08', '10:00', UB, 'America/New_York')).toEqual({
      date: '2026-10-07',
      time: '22:00',
    });
  });
});

describe('utcOffsetLabel', () => {
  it('formats offsets', () => {
    const at = new Date('2026-10-08T00:00:00Z');
    expect(utcOffsetLabel(UB, at)).toBe('UTC+8');
    expect(utcOffsetLabel('UTC', at)).toBe('UTC');
    expect(utcOffsetLabel('Asia/Kolkata', at)).toBe('UTC+5:30');
    expect(utcOffsetLabel('America/New_York', at)).toBe('UTC-4');
  });
});
