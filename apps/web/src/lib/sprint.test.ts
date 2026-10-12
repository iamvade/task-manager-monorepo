import { describe, expect, it } from 'vitest';
import { nextSprintDates } from './sprint';

// 2026-10-12 is a Monday.
const TODAY = '2026-10-12';

describe('nextSprintDates', () => {
  it('starts today and lasts two weeks without sprints', () => {
    expect(nextSprintDates([], TODAY)).toEqual({ startDate: '2026-10-12', endDate: '2026-10-23' });
  });

  it('starts on the next working day when today is a weekend', () => {
    expect(nextSprintDates([], '2026-10-10')).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-23',
    });
  });

  it('follows the latest sprint and keeps its length', () => {
    const sprints = [
      { startDate: '2026-09-14', endDate: '2026-10-02' },
      // 15 working days, ends Friday Oct 23.
      { startDate: '2026-10-05', endDate: '2026-10-23' },
    ];
    expect(nextSprintDates(sprints, TODAY)).toEqual({
      startDate: '2026-10-26',
      endDate: '2026-11-13',
    });
  });

  it('starts today when the latest sprint is over', () => {
    const sprints = [{ startDate: '2026-09-21', endDate: '2026-09-25' }];
    expect(nextSprintDates(sprints, TODAY)).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-16',
    });
  });

  it('starts tomorrow when the latest sprint ends today', () => {
    const sprints = [{ startDate: '2026-10-12', endDate: '2026-10-12' }];
    expect(nextSprintDates(sprints, TODAY)).toEqual({
      startDate: '2026-10-13',
      endDate: '2026-10-13',
    });
  });
});
