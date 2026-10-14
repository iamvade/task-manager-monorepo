import type { UserRef, WorkspaceMember } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { BAT, DORJ, SARA, workloadReport } from '../test/reports';
import { reassignInWorkload } from './workloadCache';

const member = (user: UserRef, capacityPoints = 15): WorkspaceMember => ({
  user: { ...user, email: `${user.initials.toLowerCase()}@kite.test` },
  role: 'member',
  title: 'QA',
  capacityPoints,
  joinedAt: '2026-01-01T00:00:00.000Z',
  awayUntil: null,
  awayNote: null,
  deactivatedAt: null,
});
const NEW = {
  id: '01890000-0000-7000-8000-000000000108',
  name: 'Bayarmaa T.',
  initials: 'BT',
  avatarColor: 'yellow',
} as const;

describe('reassignInWorkload', () => {
  const report = workloadReport();
  const row = (r: typeof report, id: string) => r.people.find((p) => p.user.id === id);
  const xl = row(report, DORJ.id)?.tasks.find((t) => t.points === 8);
  if (!xl) throw new Error('fixture');

  it('moves a task from one person to another and re-totals both rows', () => {
    const next = reassignInWorkload(report, xl.id, [BAT], []);
    expect(row(next, DORJ.id)).toMatchObject({
      openTasks: 2,
      points: 8,
      buckets: { overdue: { points: 8, tasks: 2 }, week: { points: 0, tasks: 0 } },
      // Still 8 overdue points: Heavy whatever the total.
      load: 'heavy',
    });
    expect(row(next, BAT.id)).toMatchObject({
      openTasks: 2,
      points: 9,
      buckets: { week: { points: 8, tasks: 1 }, none: { points: 1, tasks: 1 } },
      load: 'balanced',
    });
    // Bucket order: this week before no due date.
    expect(row(next, BAT.id)?.tasks.map((t) => t.bucket)).toEqual(['week', 'none']);
    expect(row(next, BAT.id)?.tasks[0]?.assignees).toEqual([BAT]);
    expect(next.totals).toEqual({ openTasks: 6, points: 27 });
    // Untouched rows keep their identity.
    expect(row(next, SARA.id)).toBe(row(report, SARA.id));
  });

  it('adds a co-assignee without counting the task twice in the totals', () => {
    const next = reassignInWorkload(report, xl.id, [DORJ, SARA], []);
    expect(row(next, DORJ.id)?.points).toBe(16);
    expect(row(next, SARA.id)?.points).toBe(18);
    expect(row(next, SARA.id)?.load).toBe('balanced');
    expect(next.totals).toEqual({ openTasks: 6, points: 27 });
  });

  it('adds a row for someone not listed yet, from the members list', () => {
    const next = reassignInWorkload(report, xl.id, [NEW], [member(NEW, 10)]);
    expect(row(next, NEW.id)).toMatchObject({
      title: 'QA',
      capacity: 10,
      points: 8,
      // 8 > 10 / 2 and ≤ 12: Balanced.
      load: 'balanced',
    });
  });

  it('drops an unassigned task from the totals and ignores unknown tasks', () => {
    const next = reassignInWorkload(report, xl.id, [], []);
    expect(next.totals).toEqual({ openTasks: 5, points: 19 });
    expect(reassignInWorkload(report, 'nope', [BAT], [])).toBe(report);
  });
});
