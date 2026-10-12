import type { AgingTask, OverviewReport } from '@kite/shared';
import { PROJECT_ID, SPACE_ID, WORKSPACE_ID } from './fixtures';

/** Reports "now": Thursday Oct 8 2026, 11:00 in Ulaanbaatar (the seed's today). */
export const REPORTS_NOW = new Date('2026-10-08T03:00:00Z');

const SARA = {
  id: '01890000-0000-7000-8000-000000000099',
  name: 'Sara Khan',
  initials: 'SK',
  avatarColor: 'rose',
} as const;

const weeks = (start: string, counts: number[], partialLast: boolean) =>
  counts.map((count, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return {
      weekStart: d.toISOString().slice(0, 10),
      count,
      partial: partialLast && i === counts.length - 1,
    };
  });

export function agingTask(n: number, days: number, extra: Partial<AgingTask> = {}): AgingTask {
  return {
    id: `01890000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`,
    key: `APP-${String(100 + n)}`,
    title: `Aging task ${String(n)}`,
    priority: 'medium',
    size: 'M',
    dueDate: null,
    status: {
      id: '01890000-0000-7000-8000-000000000040',
      name: null,
      category: 'review',
      color: null,
    },
    project: {
      id: PROJECT_ID,
      spaceId: SPACE_ID,
      key: 'APP',
      name: 'App Redesign',
      color: 'violet',
    },
    assignees: [SARA],
    enteredAt: '2026-09-30T03:00:00.000Z',
    daysInStatus: days,
    stale: days > 5,
    ...extra,
  };
}

/** Overview shaped like Reports.dc.html (142 completed, 3.2 days, 87 %, 5 overdue). */
export function overview(extra: Partial<OverviewReport> = {}): OverviewReport {
  return {
    generatedAt: '2026-10-08T02:55:00.000Z',
    today: '2026-10-08',
    timezone: 'Asia/Ulaanbaatar',
    scope: { workspaceId: WORKSPACE_ID, spaceId: null, projectId: null },
    history: { completed: 900, required: 5 },
    range: { from: '2026-09-11', to: '2026-10-08' },
    previousRange: { from: '2026-08-14', to: '2026-09-10' },
    completed: {
      current: { count: 142, points: 386, unsized: 0 },
      previous: { count: 127, points: 340, unsized: 2 },
    },
    cycleTime: {
      current: { median: 3.2, p85: 6.1, count: 142 },
      previous: { median: 3.8, p85: 7, count: 127 },
    },
    onTime: { current: { onTime: 124, total: 142 }, previous: { onTime: 105, total: 127 } },
    overdue: { count: 5, oldestDaysLate: 6 },
    throughput: {
      weeks: weeks('2026-07-20', [24, 28, 26, 31, 29, 34, 30, 33, 36, 35, 38, 33], true),
      previous: weeks('2026-04-27', [22, 25, 27, 24, 28, 26, 29, 27, 30, 32, 31, 34], false),
    },
    waits: [
      { category: 'todo', medianDays: 1.4, periods: 40 },
      { category: 'in_progress', medianDays: 2.1, periods: 60 },
      { category: 'review', medianDays: 4.6, periods: 50 },
    ],
    aging: {
      total: 8,
      staleCount: 3,
      tasks: [9, 7, 6, 5, 4, 3, 2, 1].map((d, i) => agingTask(i, d)),
    },
    ...extra,
  };
}
