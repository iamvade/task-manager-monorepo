import { SIZE_POINTS, startOfWeek, workingDaysBetween } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../src/db/holidays.js';
import type { Text } from '../src/db/seed/data.js';
import { createClock } from '../src/db/seed/dates.js';
import { ubDate } from '../src/db/seed/history.js';
import { buildRows } from '../src/db/seed/index.js';

// The seed's report data, built in memory (no database): the invariants the deferred triggers
// check at commit, plus the shapes the Reports designs rely on.

const pick = (text: Text) => (typeof text === 'string' ? text : text[1]);
const holidays = new Set(MN_PUBLIC_HOLIDAYS_2026.map((h) => h.date));
function groupBy<T, K>(items: readonly T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

describe.each(['2026-10-08', '2026-10-12', '2026-12-20'])('seed history (today %s)', (today) => {
  const rows = buildRows(createClock(today), pick, 'hash', 'en');
  const project = (key: string) => {
    const p = rows.projects.find((x) => x.key === key);
    if (!p) throw new Error(`no ${key}`);
    return p;
  };

  it('gives every task one open status period matching its status, in order', () => {
    const byTask = groupBy(rows.periods, (p) => p.taskId);
    for (const task of rows.tasks) {
      const periods = (byTask.get(task.id) ?? []).sort(
        (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime(),
      );
      const open = periods.filter((p) => !p.exitedAt);
      expect(open, task.title).toHaveLength(1);
      expect(open[0]?.statusId, task.title).toBe(task.statusId);
      periods.slice(1).forEach((p, i) => {
        expect(periods[i]?.exitedAt, task.title).toEqual(p.enteredAt);
      });
      expect(periods[0]?.enteredAt, task.title).toEqual(task.createdAt);
    }
  });

  it('keeps each task’s sprint in an open membership', () => {
    for (const task of rows.tasks) {
      const open = rows.memberships.filter((m) => m.taskId === task.id && !m.removedAt);
      if (task.sprintId)
        expect(
          open.map((m) => m.sprintId),
          task.title,
        ).toEqual([task.sprintId]);
      else expect(open, task.title).toHaveLength(0);
    }
  });

  it('runs App Redesign Sprints 9–14, today being day 4 of 15 working days', () => {
    expect(rows.sprints.map((s) => s.number)).toEqual([9, 10, 11, 12, 13, 14]);
    const current = rows.sprints.find((s) => s.number === 14);
    if (!current) throw new Error('no Sprint 14');
    expect(workingDaysBetween(current.startDate, current.endDate, holidays)).toBe(15);
    const day = workingDaysBetween(current.startDate, today, holidays);
    // On a weekend the last working day counts.
    expect(day).toBe(4);
    const inSprint = rows.tasks.filter((t) => t.sprintId === current.id);
    expect(inSprint).toHaveLength(16);
    const added = rows.memberships.filter(
      (m) => m.sprintId === current.id && ubDate(m.addedAt) >= current.startDate,
    );
    expect(added).toHaveLength(3);
    const carried = rows.memberships.filter((m) => m.removedAt && m.sprintId !== current.id);
    expect(carried.length).toBeGreaterThan(0);
  });

  it('makes In Review the slowest stage of App Redesign', () => {
    const app = project('APP');
    const ids = new Set(rows.tasks.filter((t) => t.projectId === app.id).map((t) => t.id));
    const days = (category: string) =>
      median(
        rows.periods
          .filter((p) => ids.has(p.taskId) && p.category === category && p.exitedAt)
          .map((p) => ((p.exitedAt?.getTime() ?? 0) - p.enteredAt.getTime()) / 86_400_000),
      );
    expect(days('review')).toBeGreaterThan(days('in_progress'));
    expect(days('review')).toBeGreaterThan(days('todo'));
  });

  it('completes ~30 tasks a week, keeps drawn keys and leaves Partner Portal nearly empty', () => {
    const weeks = groupBy(
      rows.tasks.filter((t) => t.completedAt),
      (t) => startOfWeek(ubDate(t.completedAt ?? new Date())),
    );
    const thisWeek = startOfWeek(today);
    const full = [...weeks].filter(([week]) => week < thisWeek).map(([, tasks]) => tasks.length);
    expect(full.length).toBeGreaterThanOrEqual(23);
    expect(median(full)).toBeGreaterThanOrEqual(25);

    const app = project('APP');
    const appTasks = rows.tasks.filter((t) => t.projectId === app.id);
    expect(appTasks.find((t) => t.number === 142)?.title).toBe('Checkout page — responsive layout');
    expect(Math.max(...appTasks.filter((t) => t.number < 121).map((t) => t.number))).toBeLessThan(
      121,
    );
    expect(app.taskSeq).toBe(Math.max(...appTasks.map((t) => t.number)));

    const partner = project('PRT');
    expect(rows.tasks.filter((t) => t.projectId === partner.id && t.completedAt)).toHaveLength(1);
  });

  it('sizes most tasks and sets reviewers on reviewed ones', () => {
    const sized = rows.tasks.filter((t) => t.size).length / rows.tasks.length;
    expect(sized).toBeGreaterThan(0.85);
    expect(Object.keys(SIZE_POINTS)).toEqual(['S', 'M', 'L', 'XL']);
    const reviewedIds = new Set(
      rows.periods.filter((p) => p.category === 'review').map((p) => p.taskId),
    );
    for (const task of rows.tasks.filter((t) => reviewedIds.has(t.id))) {
      expect(task.reviewerId, task.title).toBeTruthy();
    }
  });

  it('has comments with @mentions answered by replies', () => {
    const replies = rows.comments.filter((c) => c.parentId);
    expect(replies.length).toBeGreaterThan(50);
    const mentions = rows.comments.filter((c) => JSON.stringify(c.body).includes('"mention"'));
    expect(mentions.length).toBeGreaterThan(replies.length);
  });
});
