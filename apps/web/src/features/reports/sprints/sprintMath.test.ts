import { describe, expect, it } from 'vitest';
import { burndownLabelIndexes, percent, projectedLine, replanHref } from './sprintMath';

describe('sprint helpers', () => {
  it('labels day 1, the Mondays and the last day of the burndown', () => {
    // The sprint start, then 15 working days (Tue Oct 6 – Mon Oct 26).
    const dates = [
      '2026-10-06',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-26',
    ];
    // Monday Oct 26 is the last day itself; Monday Oct 19 is 5 columns before it.
    expect([...burndownLabelIndexes(dates)].sort((a, b) => a - b)).toEqual([1, 5, 10, 15]);
  });

  it('projects linearly from today to the projected end', () => {
    expect(projectedLine(6, 2, 10, 4)).toEqual([null, null, 10, 8, 6, 4]);
    expect(projectedLine(3, 2, 7, 7)).toEqual([null, null, 7]);
  });

  it('formats shares and builds the Replan link', () => {
    expect(percent(11, 45)).toBe('24%');
    expect(percent(1, 0)).toBe('0%');
    expect(
      replanHref('p1', 's1', [
        { id: 'a', category: 'todo' },
        { id: 'b', category: 'review' },
        { id: 'c', category: 'done' },
      ]),
    ).toBe('/p/p1/list?sprint=s1&status=a,b');
    expect(replanHref('p1', 's1', undefined)).toBe('/p/p1/list?sprint=s1');
  });
});
