import { describe, expect, it } from 'vitest';
import { fileSize, relativeTime } from './relativeTime';

const TZ = 'Asia/Ulaanbaatar'; // UTC+8
// Thursday Oct 8 2026, 14:00 in Ulaanbaatar.
const NOW = new Date('2026-10-08T06:00:00Z');

describe('relativeTime', () => {
  it('counts minutes and hours earlier today', () => {
    expect(relativeTime('2026-10-08T05:59:30Z', NOW, TZ, 'en')).toEqual({ kind: 'justNow' });
    expect(relativeTime('2026-10-08T05:55:00Z', NOW, TZ, 'en')).toEqual({
      kind: 'minutes',
      count: 5,
    });
    expect(relativeTime('2026-10-08T04:00:00Z', NOW, TZ, 'en')).toEqual({
      kind: 'hours',
      count: 2,
    });
  });

  it('uses the calendar day in the user time zone', () => {
    // 23:30 on Oct 7 in Ulaanbaatar: yesterday, though under a day ago.
    expect(relativeTime('2026-10-07T15:30:00Z', NOW, TZ, 'en')).toEqual({
      kind: 'yesterday',
      time: '11:30 PM',
    });
    expect(relativeTime('2026-10-07T08:12:00Z', NOW, TZ, 'mn')).toEqual({
      kind: 'yesterday',
      time: '16:12',
    });
    expect(relativeTime('2026-10-01T02:00:00Z', NOW, TZ, 'en')).toEqual({
      kind: 'date',
      date: '2026-10-01',
    });
  });
});

describe('fileSize', () => {
  it('formats like the designs', () => {
    expect(fileSize(512)).toEqual({ unit: 'b', value: '512' });
    expect(fileSize(248 * 1024)).toEqual({ unit: 'kb', value: '248' });
    expect(fileSize(2.5 * 1024 * 1024)).toEqual({ unit: 'mb', value: '2.5' });
    expect(fileSize(3 * 1024 * 1024)).toEqual({ unit: 'mb', value: '3' });
    expect(fileSize(24 * 1024 * 1024)).toEqual({ unit: 'mb', value: '24' });
  });
});
