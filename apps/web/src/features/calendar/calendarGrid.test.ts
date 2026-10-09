import { describe, expect, it } from 'vitest';
import { at, makeTask } from '../../test/tasks';
import { dropDue, keyTarget } from './calendarDrag';
import { calendarDays, periodTitle, placeTasks, shiftPeriod, visiblePills } from './calendarGrid';

describe('calendarDays', () => {
  it('covers October 2026 in five Monday-first weeks (Sep 28 – Nov 1)', () => {
    const days = calendarDays('2026-10-08', 'month');
    expect(days).toHaveLength(35);
    expect(at(days, 0)).toEqual({ date: '2026-09-28', inPeriod: false, weekend: false });
    expect(at(days, 3)).toEqual({ date: '2026-10-01', inPeriod: true, weekend: false });
    expect(at(days, 5).weekend).toBe(true);
    expect(at(days, 34)).toEqual({ date: '2026-11-01', inPeriod: false, weekend: true });
  });

  it('uses six weeks when the month needs them and four for a tight February', () => {
    // August 2026 starts on a Saturday and has 31 days.
    expect(calendarDays('2026-08-15', 'month')).toHaveLength(42);
    // February 2027 starts on a Monday and has 28 days.
    const feb = calendarDays('2027-02-10', 'month');
    expect(feb).toHaveLength(28);
    expect(at(feb, 0).date).toBe('2027-02-01');
  });

  it('shows the Mon–Sun week of the anchor', () => {
    const days = calendarDays('2026-10-08', 'week');
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(days.every((d) => d.inPeriod)).toBe(true);
  });
});

describe('shiftPeriod', () => {
  it('steps months across years and weeks by seven days', () => {
    expect(shiftPeriod('2026-10-08', 'month', 1)).toBe('2026-11-01');
    expect(shiftPeriod('2026-12-31', 'month', 1)).toBe('2027-01-01');
    expect(shiftPeriod('2026-01-15', 'month', -1)).toBe('2025-12-01');
    expect(shiftPeriod('2026-10-08', 'week', 1)).toBe('2026-10-12');
    expect(shiftPeriod('2026-10-08', 'week', -1)).toBe('2026-09-28');
  });
});

describe('periodTitle', () => {
  it('picks the template by how the week falls', () => {
    expect(periodTitle('2026-10-08', 'month')).toMatchObject({
      key: 'month',
      vars: { year: 2026, m: 10 },
    });
    expect(periodTitle('2026-10-08', 'week')).toMatchObject({
      key: 'week',
      vars: { startDay: 5, endDay: 11, m: 10, year: 2026 },
    });
    expect(periodTitle('2026-10-01', 'week')).toMatchObject({
      key: 'weekCrossMonth',
      vars: { startM: 9, startDay: 28, endM: 10, endDay: 4 },
    });
    expect(periodTitle('2026-12-31', 'week')).toMatchObject({
      key: 'weekCrossYear',
      vars: { startYear: 2026, endYear: 2027, startDay: 28, endDay: 3 },
    });
  });
});

describe('placeTasks', () => {
  it('puts dated tasks on their day and open undated ones in Unscheduled, once each', () => {
    const days = calendarDays('2026-10-08', 'week');
    const due = makeTask('Due', 'todo', { due: '2026-10-09' });
    const outside = makeTask('Outside', 'todo', { due: '2026-11-20' });
    const open = makeTask('Open', 'todo');
    const done = makeTask('Done', 'done');
    const { byDay, unscheduled } = placeTasks([due, outside, open, done, open], days);
    expect(byDay.get('2026-10-09')).toEqual([due]);
    expect([...byDay.values()].flat()).toEqual([due]);
    expect(unscheduled).toEqual([open]);
  });
});

describe('visiblePills', () => {
  it('shows up to three, otherwise two and "+N more"', () => {
    expect(visiblePills([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(visiblePills([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2], more: 3 });
  });
});

describe('dropDue', () => {
  it('returns the new due date, null to clear, or undefined for no-ops', () => {
    expect(dropDue('2026-10-08', { kind: 'day', date: '2026-10-09' }, false)).toBe('2026-10-09');
    expect(dropDue('2026-10-08', { kind: 'day', date: '2026-10-08' }, false)).toBeUndefined();
    expect(dropDue('2026-10-08', { kind: 'unscheduled' }, false)).toBeNull();
    expect(dropDue('2026-10-08', { kind: 'unscheduled' }, true)).toBeUndefined();
    expect(dropDue(null, { kind: 'unscheduled' }, false)).toBeUndefined();
    expect(dropDue(null, null, false)).toBeUndefined();
  });
});

describe('keyTarget', () => {
  const days = calendarDays('2026-10-08', 'month').map((d) => d.date);
  const day = (date: string) => ({ kind: 'day' as const, date });

  it('moves a day with ←/→ and a week with ↑/↓ inside the grid', () => {
    expect(keyTarget(day('2026-10-08'), 'ArrowRight', days, 'month', '')).toEqual(
      day('2026-10-09'),
    );
    expect(keyTarget(day('2026-10-08'), 'ArrowUp', days, 'month', '')).toEqual(day('2026-10-01'));
    expect(keyTarget(day('2026-10-01'), 'ArrowUp', days, 'month', '')).toBeNull();
    expect(keyTarget(day('2026-10-08'), 'ArrowDown', days.slice(0, 7), 'week', '')).toBeNull();
  });

  it('reaches Unscheduled with → from a Sunday and comes back with ←', () => {
    expect(keyTarget(day('2026-10-11'), 'ArrowRight', days, 'month', '')).toEqual({
      kind: 'unscheduled',
    });
    expect(keyTarget({ kind: 'unscheduled' }, 'ArrowLeft', days, 'month', '2026-10-11')).toEqual(
      day('2026-10-11'),
    );
    expect(keyTarget({ kind: 'unscheduled' }, 'ArrowUp', days, 'month', '2026-10-11')).toBeNull();
  });
});
