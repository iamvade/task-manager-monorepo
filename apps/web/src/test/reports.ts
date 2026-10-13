import type {
  AgingTask,
  CarriedTask,
  OverviewReport,
  PersonReport,
  SprintDetail,
  SprintsReport,
  WorkloadPerson,
  WorkloadReport,
  WorkloadTask,
} from '@kite/shared';
import { PROJECT_ID, SPACE_ID, WORKSPACE_ID } from './fixtures';

/** Reports "now": Thursday Oct 8 2026, 11:00 in Ulaanbaatar (the seed's today). */
export const REPORTS_NOW = new Date('2026-10-08T03:00:00Z');

export const SARA = {
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

const PROJECT_REF = {
  id: PROJECT_ID,
  spaceId: SPACE_ID,
  key: 'APP',
  name: 'App Redesign',
  color: 'violet',
} as const;

const sprintId = (n: number) => `01890000-0000-7000-8000-0000000007${String(n).padStart(2, '0')}`;

/** Sprints 9–14 of App Redesign; 14 (Oct 5 – Oct 23) is current. */
export const SPRINTS = [9, 10, 11, 12, 13, 14].map((n) => {
  const start = new Date(Date.UTC(2026, 6, 13 + (n - 9) * 21));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 18);
  return {
    id: sprintId(n),
    number: n,
    name: null,
    startDate: n === 14 ? '2026-10-05' : start.toISOString().slice(0, 10),
    endDate: n === 14 ? '2026-10-23' : end.toISOString().slice(0, 10),
    current: n === 14,
  };
});

const TOTALS: Record<number, [number, number, number]> = {
  9: [34, 4, 28],
  10: [36, 6, 31],
  11: [38, 7, 30],
  12: [35, 3, 32],
  13: [40, 5, 33],
  14: [42, 3, 11],
};

export function carriedTask(n: number, times: number): CarriedTask {
  const { enteredAt: _entered, daysInStatus: _days, stale: _stale, ...task } = agingTask(n, 1);
  return {
    ...task,
    id: `01890000-0000-7000-8000-0000000006${String(n).padStart(2, '0')}`,
    key: `APP-${String(200 + n)}`,
    title: `Carried task ${String(n)}`,
    timesCarried: times,
    replan: times >= 3,
  };
}

/** Sprint 14 on day 4 of 15 (ReportsSprints.dc.html): 42 committed, 34 left, ≈ 12 projected. */
export function sprintDetail(extra: Partial<SprintDetail> = {}): SprintDetail {
  const ref = SPRINTS[5] ?? SPRINTS[0];
  if (!ref) throw new Error('no sprints');
  const days = ['2026-10-05', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  for (let d = 9; days.length < 16; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(date);
  }
  const remaining = [42, 40, 37, 36, 34];
  const added = [0, 0, 0, 2, 1];
  return {
    ...ref,
    state: 'current',
    workingDays: { total: 15, elapsed: 4, left: 11 },
    committed: 42,
    carriedIn: 7,
    carriedInRepeated: 3,
    added: 3,
    completed: 11,
    carriedOut: null,
    previousSprint: SPRINTS[4] ?? null,
    nextSprint: null,
    burndown: days.map((date, i) => ({
      date,
      remaining: remaining[i] ?? null,
      ideal: Math.round(42 * (1 - i / 15) * 10) / 10,
      added: added[i] ?? 0,
    })),
    projectedRemaining: 12,
    pace: 'slightly_behind',
    waitingMost: 'review',
    recent: SPRINTS.map((s) => {
      const [committed, addedN, completed] = TOTALS[s.number] ?? [0, 0, 0];
      return { ...s, committed, added: addedN, completed };
    }),
    carried: [carriedTask(1, 3), carriedTask(2, 2), carriedTask(3, 1)],
    ...extra,
  };
}

export function sprintsReport(extra: Partial<SprintsReport> = {}): SprintsReport {
  return {
    generatedAt: '2026-10-08T02:55:00.000Z',
    today: '2026-10-08',
    timezone: 'Asia/Ulaanbaatar',
    scope: { workspaceId: WORKSPACE_ID, spaceId: null, projectId: null },
    history: { completed: 900, required: 5 },
    project: PROJECT_REF,
    sprints: [...SPRINTS].reverse(),
    sprint: sprintDetail(),
    ...extra,
  };
}

export const DORJ = {
  id: '01890000-0000-7000-8000-000000000104',
  name: 'Dorj E.',
  initials: 'DE',
  avatarColor: 'amber',
} as const;
export const BAT = {
  id: '01890000-0000-7000-8000-000000000107',
  name: 'Bat O.',
  initials: 'BO',
  avatarColor: 'teal',
} as const;

export function workloadTask(
  n: number,
  points: number,
  bucket: WorkloadTask['bucket'],
  dueDate: string | null,
  assignees: WorkloadTask['assignees'],
  /** Weighs on the load; by default everything with a due date (the fixtures' dates are near). */
  counted = bucket !== 'none',
): WorkloadTask {
  const size = ({ 1: 'S', 3: 'M', 5: 'L', 8: 'XL' } as const)[points as 1 | 3 | 5 | 8];
  return {
    id: `01890000-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`,
    key: `APP-${String(300 + n)}`,
    title: `Workload task ${String(n)}`,
    priority: 'high',
    size,
    points,
    dueDate,
    bucket,
    counted,
    project: PROJECT_REF,
    assignees,
  };
}

export function workloadPerson(
  user: WorkloadPerson['user'],
  title: string | null,
  tasks: WorkloadTask[],
  load: WorkloadPerson['load'],
): WorkloadPerson {
  const sum = (b: WorkloadTask['bucket']) => {
    const inB = tasks.filter((t) => t.bucket === b);
    return { points: inB.reduce((a, t) => a + t.points, 0), tasks: inB.length };
  };
  return {
    user,
    title,
    capacity: 15,
    openTasks: tasks.length,
    points: tasks.reduce((a, t) => a + t.points, 0),
    loadPoints: tasks.reduce((a, t) => a + (t.counted ? t.points : 0), 0),
    buckets: { overdue: sum('overdue'), week: sum('week'), later: sum('later'), none: sum('none') },
    load,
    tasks,
  };
}

/**
 * Dorj: 16 pts with 8 overdue (Heavy); Sara: 10 pts, her undated task in the current sprint
 * (Balanced); Bat: 1 undated pt outside any sprint (Light).
 */
export function workloadReport(extra: Partial<WorkloadReport> = {}): WorkloadReport {
  const dorj = [
    workloadTask(1, 3, 'overdue', '2026-10-03', [DORJ]),
    workloadTask(2, 5, 'overdue', '2026-10-07', [DORJ]),
    workloadTask(3, 8, 'week', '2026-10-09', [DORJ]),
  ];
  const sara = [
    workloadTask(4, 5, 'later', '2026-10-20', [SARA]),
    workloadTask(5, 5, 'none', null, [SARA], true),
  ];
  const bat = [workloadTask(6, 1, 'none', null, [BAT])];
  return {
    generatedAt: '2026-10-08T02:55:00.000Z',
    today: '2026-10-08',
    timezone: 'Asia/Ulaanbaatar',
    scope: { workspaceId: WORKSPACE_ID, spaceId: null, projectId: null },
    history: { completed: 900, required: 5 },
    weekEnd: '2026-10-11',
    people: [
      workloadPerson(SARA, 'Product designer', sara, 'balanced'),
      workloadPerson(DORJ, 'Frontend engineer', dorj, 'heavy'),
      workloadPerson(BAT, 'Engineering lead', bat, 'light'),
    ],
    totals: { openTasks: 6, points: 27 },
    ...extra,
  };
}

/** Dorj's People report (ReportsPeople.dc.html numbers): 12 weeks of trends, 2 open tasks. */
export function personReport(extra: Partial<PersonReport> = {}): PersonReport {
  const done = [2, 3, 3, 4, 2, 3, 4, 3, 3, 4, 4, 3];
  const cycle = [3.1, 2.9, 3.4, 3.0, 3.2, null, 3.3, 3.5, 3.9, 3.6, 4.1, 3.7];
  return {
    generatedAt: '2026-10-08T02:55:00.000Z',
    today: '2026-10-08',
    timezone: 'Asia/Ulaanbaatar',
    scope: { workspaceId: WORKSPACE_ID, spaceId: null, projectId: null },
    history: { completed: 900, required: 5 },
    range: { from: '2026-09-11', to: '2026-10-08' },
    previousRange: { from: '2026-08-14', to: '2026-09-10' },
    person: { user: DORJ, title: 'Frontend engineer', role: 'member' },
    completed: {
      current: { count: 14, points: 38, unsized: 0 },
      previous: { count: 11, points: 31, unsized: 0 },
    },
    onTime: { current: { onTime: 11, total: 14 }, previous: { onTime: 11, total: 13 } },
    cycleTime: {
      current: { median: 3.8, p85: 6, count: 14 },
      previous: { median: 3.4, p85: 5, count: 11 },
    },
    overdue: { count: 2, oldestDaysLate: 6 },
    reviews: {
      current: { medianDays: 1.6, count: 9 },
      previous: { medianDays: 2.1, count: 7 },
    },
    trends: {
      weeks: weeks('2026-07-20', done, true).map((w, i) => ({
        weekStart: w.weekStart,
        completed: w.count,
        cycleMedian: cycle[i] ?? null,
        partial: w.partial,
      })),
      teamCompletedMedian: 3,
      teamCycleMedian: 3.2,
    },
    helping: {
      comments: { current: 9, previous: 23 },
      subtasks: { count: 6, tasks: 4 },
      mentions: { answered: 11, total: 12, medianReplyHours: 2 },
      workedWith: [
        { user: SARA, count: 8 },
        { user: BAT, count: 5 },
      ],
    },
    openTasks: [
      { ...reportTask(1), dueDate: '2026-10-03', priority: 'urgent' },
      { ...reportTask(2), dueDate: null, priority: 'low' },
    ],
    ...extra,
  };
}

function reportTask(n: number) {
  return {
    id: `01890000-0000-7000-8000-0000000009${String(50 + n)}`,
    key: `CHK-${String(n)}`,
    title: `Open task ${String(n)}`,
    size: 'M' as const,
    status: {
      id: '01890000-0000-7000-8000-000000000040',
      name: null,
      category: 'review' as const,
      color: null,
    },
    project: PROJECT_REF,
    assignees: [DORJ],
  };
}
