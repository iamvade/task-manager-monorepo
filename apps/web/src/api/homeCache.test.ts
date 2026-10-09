import type { Home } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { HOME, HOME_NOW, LATER, OVERDUE, THIS_WEEK, TODAY } from '../test/home';
import { applyCompletion, withRow } from './homeCache';

const tick = (home: Home, taskId: string, done = true) =>
  applyCompletion(home, taskId, done, HOME_NOW);

describe('applyCompletion', () => {
  it('ticking a task due today updates due today, the week and today’s bar', () => {
    const next = tick(HOME, TODAY[0].id);
    expect(next.sections.today[0]).toMatchObject({
      done: true,
      completedAt: HOME_NOW.toISOString(),
    });
    expect(next.stats.dueToday).toEqual({ open: 2, total: 4, urgent: 0 });
    expect(next.stats.completedThisWeek).toEqual({
      count: 8,
      delta: 4,
      perDay: [2, 3, 1, 2, 0, 0, 0],
    });
    expect(next.stats.overdue).toEqual(HOME.stats.overdue);
  });

  it('ticking the oldest overdue task updates the count and the oldest delay', () => {
    const next = tick(HOME, OVERDUE[0].id);
    expect(next.stats.overdue).toEqual({ count: 1, oldestDaysLate: 1 });
    expect(next.stats.dueToday).toEqual(HOME.stats.dueToday);
    expect(next.stats.completedThisWeek.count).toBe(8);

    const none = tick(next, OVERDUE[1].id);
    expect(none.stats.overdue).toEqual({ count: 0, oldestDaysLate: null });
  });

  it('ticking a later task only counts the completion', () => {
    const next = tick(HOME, LATER[1].id);
    expect(next.stats.dueToday).toEqual(HOME.stats.dueToday);
    expect(next.stats.overdue).toEqual(HOME.stats.overdue);
    expect(next.stats.completedThisWeek.count).toBe(8);
  });

  it('unticking undoes the completion on the day it was counted', () => {
    // TODAY[3] was completed 2026-10-08T01:00Z = Thursday 09:00 in Ulaanbaatar.
    const next = tick(HOME, TODAY[3].id, false);
    expect(next.sections.today[3]).toMatchObject({ done: false, completedAt: null });
    expect(next.stats.dueToday.open).toBe(4);
    expect(next.stats.completedThisWeek).toEqual({
      count: 6,
      delta: 2,
      perDay: [2, 3, 1, 0, 0, 0, 0],
    });
  });

  it('round-trips', () => {
    expect(tick(tick(HOME, THIS_WEEK[0].id), THIS_WEEK[0].id, false).stats).toEqual(HOME.stats);
  });

  it('ignores unknown tasks and no-op toggles', () => {
    expect(tick(HOME, 'missing')).toBe(HOME);
    expect(tick(HOME, TODAY[3].id)).toBe(HOME);
  });
});

describe('withRow', () => {
  it('puts a dropped row back at its old place', () => {
    const dropped = { ...HOME, sections: { ...HOME.sections, overdue: [OVERDUE[1]] } };
    const row = { ...OVERDUE[0], done: true };
    const back = withRow(dropped, { section: 'overdue', index: 0, task: row });
    expect(back.sections.overdue.map((t) => t.id)).toEqual([OVERDUE[0].id, OVERDUE[1].id]);
    expect(withRow(HOME, { section: 'overdue', index: 0, task: row })).toBe(HOME);
  });
});
