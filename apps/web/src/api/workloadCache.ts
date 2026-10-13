import {
  WORKLOAD_BUCKETS,
  workloadLoad,
  type UserRef,
  type WorkloadBucket,
  type WorkloadPerson,
  type WorkloadReport,
  type WorkloadTask,
  type WorkspaceMember,
} from '@kite/shared';

const BUCKET_ORDER: Record<WorkloadBucket, number> = { overdue: 0, week: 1, later: 2, none: 3 };

/** The API's task order inside a row: by bucket, then due date (none last), then key. */
function byBucket(a: WorkloadTask, b: WorkloadTask): number {
  return (
    BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.key.localeCompare(b.key, undefined, { numeric: true })
  );
}

/** A row's totals, buckets and Heavy / Balanced / Light from its tasks. */
export function summarize(person: WorkloadPerson, tasks: WorkloadTask[]): WorkloadPerson {
  const buckets = Object.fromEntries(
    WORKLOAD_BUCKETS.map((b) => {
      const inBucket = tasks.filter((t) => t.bucket === b);
      return [b, { points: inBucket.reduce((s, t) => s + t.points, 0), tasks: inBucket.length }];
    }),
  ) as WorkloadPerson['buckets'];
  const points = tasks.reduce((s, t) => s + t.points, 0);
  const loadPoints = tasks.reduce((s, t) => s + (t.counted ? t.points : 0), 0);
  return {
    ...person,
    tasks: [...tasks].sort(byBucket),
    openTasks: tasks.length,
    points,
    loadPoints,
    buckets,
    load: workloadLoad(loadPoints, buckets.overdue.points, person.capacity),
  };
}

/** A row for someone who wasn't listed yet (a scope filter hid them until now). */
function newRow(member: WorkspaceMember): WorkloadPerson {
  const { id, name, initials, avatarColor } = member.user;
  const empty = { points: 0, tasks: 0 };
  return {
    user: { id, name, initials, avatarColor },
    title: member.title,
    capacity: member.capacityPoints,
    openTasks: 0,
    points: 0,
    loadPoints: 0,
    buckets: { overdue: empty, week: empty, later: empty, none: empty },
    load: 'light',
    tasks: [],
  };
}

/**
 * The Workload report after `taskId`'s assignees become `users`: the task leaves the rows of
 * people no longer assigned and joins the rows of new ones (added from `members` if missing),
 * every changed row is re-totalled, and the distinct totals follow. Unchanged if the task isn't
 * in the report.
 */
export function reassignInWorkload(
  report: WorkloadReport,
  taskId: string,
  users: readonly UserRef[],
  members: readonly WorkspaceMember[],
): WorkloadReport {
  const found = report.people.flatMap((p) => p.tasks).find((t) => t.id === taskId);
  if (!found) return report;
  const assignees = [...users].sort((a, b) => a.name.localeCompare(b.name));
  const task: WorkloadTask = { ...found, assignees };
  const ids = new Set(users.map((u) => u.id));

  const people = report.people.map((p) => {
    const had = p.tasks.some((t) => t.id === taskId);
    const has = ids.has(p.user.id);
    if (!had && !has) return p;
    const others = p.tasks.filter((t) => t.id !== taskId);
    return summarize(p, has ? [...others, task] : others);
  });
  for (const user of users) {
    if (people.some((p) => p.user.id === user.id)) continue;
    const member = members.find((m) => m.user.id === user.id);
    if (member) people.push(summarize(newRow(member), [task]));
  }

  const distinct = new Map(people.flatMap((p) => p.tasks.map((t) => [t.id, t.points] as const)));
  return {
    ...report,
    people,
    totals: {
      openTasks: distinct.size,
      points: [...distinct.values()].reduce((a, b) => a + b, 0),
    },
  };
}
