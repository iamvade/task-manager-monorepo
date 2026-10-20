import { DEFAULT_STATUS_CATEGORIES, type StatusCategory } from '@kite/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../holidays.js';
import type * as schema from '../schema/index.js';
import { PEOPLE, type PersonRef, type Text } from './data.js';
import type { Clock } from './dates.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

/**
 * A second, small workspace so some people belong to two (the workspace switcher): Bat owns it,
 * Anu and Dorj are members. Its one project is keyed `APP` like App Redesign, so `APP-1` exists in
 * both and task links need the workspace. Anu has one unread "assigned" notification here.
 */
export const LABS = { name: 'Kite Labs', slug: 'kite-labs' } as const;

const MEMBERS: readonly { ref: PersonRef; role: 'owner' | 'member' }[] = [
  { ref: 'bat', role: 'owner' },
  { ref: 'anu', role: 'member' },
  { ref: 'dorj', role: 'member' },
];

const TASKS: readonly {
  title: Text;
  status: StatusCategory;
  assignee: PersonRef;
  hoursAgo: number;
}[] = [
  {
    title: ['Офлайн синкийг турших', 'Try offline sync'],
    status: 'in_progress',
    assignee: 'anu',
    hoursAgo: 3,
  },
  {
    title: ['Зураг ачаалалтыг хэмжих', 'Benchmark image loading'],
    status: 'todo',
    assignee: 'dorj',
    hoursAgo: 26,
  },
  {
    title: ['Push мэдэгдлийн туршилт', 'Spike: push notifications'],
    status: 'todo',
    assignee: 'bat',
    hoursAgo: 50,
  },
];

export function buildLabs(
  clock: Clock,
  pick: (text: Text) => string,
  userId: (ref: PersonRef) => string,
  joinedAt: Date,
) {
  const workspaceId = uuidv7();
  const owner = userId('bat');
  const at = (hoursAgo: number) => new Date(clock.now.getTime() - hoursAgo * 3_600_000);

  const space = {
    id: uuidv7(),
    workspaceId,
    name: pick(['Туршилт', 'Experiments']),
    initial: pick(['Т', 'E']),
    color: 'teal',
    position: generateNKeysBetween(null, null, 1)[0] ?? 'a0',
    createdBy: owner,
  } satisfies Row<typeof schema.spaces>;

  const project = {
    id: uuidv7(),
    workspaceId,
    spaceId: space.id,
    name: pick(['Апп прототип', 'App Prototype']),
    key: 'APP',
    color: 'teal',
    taskSeq: TASKS.length,
    position: generateNKeysBetween(null, null, 1)[0] ?? 'a0',
    leadId: owner,
    createdBy: owner,
    createdAt: joinedAt,
  } satisfies Row<typeof schema.projects>;

  const statusKeys = generateNKeysBetween(null, null, DEFAULT_STATUS_CATEGORIES.length);
  const statuses = DEFAULT_STATUS_CATEGORIES.map((category, i) => ({
    id: uuidv7(),
    projectId: project.id,
    name: null,
    category,
    color: null,
    position: statusKeys[i] ?? `a${i}`,
  }));
  const status = (category: StatusCategory) => {
    const row = statuses.find((s) => s.category === category);
    if (!row) throw new Error(`Seed data error: Labs status ${category}`);
    return row;
  };

  const taskKeys = generateNKeysBetween(null, null, TASKS.length);
  const tasks = TASKS.map((def, i) => {
    const createdAt = at(def.hoursAgo + 24);
    return {
      def,
      row: {
        id: uuidv7(),
        projectId: project.id,
        number: i + 1,
        statusId: status(def.status).id,
        title: pick(def.title),
        descriptionText: '',
        priority: 'medium',
        position: taskKeys[i] ?? `a${i}`,
        createdBy: owner,
        createdAt,
        updatedAt: at(def.hoursAgo),
      } satisfies Row<typeof schema.tasks>,
    };
  });

  type PeriodRow = Row<typeof schema.taskStatusPeriods>;
  const periods = tasks.flatMap(({ def, row }): PeriodRow[] => {
    const todo: PeriodRow = {
      taskId: row.id,
      statusId: status('todo').id,
      category: 'todo',
      enteredAt: row.createdAt,
      enteredBy: owner,
    };
    if (def.status === 'todo') return [{ ...todo, exitedAt: null, exitedBy: null }];
    const moved = at(def.hoursAgo);
    const by = userId(def.assignee);
    return [
      { ...todo, exitedAt: moved, exitedBy: by },
      {
        taskId: row.id,
        statusId: status(def.status).id,
        category: def.status,
        enteredAt: moved,
        enteredBy: by,
      },
    ];
  });

  const activity: (Row<typeof schema.activity> & { id: string })[] = [];
  const notifications: Row<typeof schema.notifications>[] = [];
  const followers: Row<typeof schema.taskFollowers>[] = [];
  const snapshot = (category: StatusCategory) => ({
    id: status(category).id,
    name: null,
    category,
  });
  for (const { def, row } of tasks) {
    const assigneeId = userId(def.assignee);
    followers.push({ taskId: row.id, userId: owner });
    if (assigneeId !== owner) followers.push({ taskId: row.id, userId: assigneeId });
    const base = { workspaceId, projectId: project.id, taskId: row.id, actorId: owner };
    activity.push({
      ...base,
      id: uuidv7(),
      type: 'task.created',
      payload: { status: snapshot('todo') },
      createdAt: row.createdAt,
    });
    const assigned = {
      ...base,
      id: uuidv7(),
      type: 'assignee.added' as const,
      payload: { user: { id: assigneeId, name: pick(PEOPLE[def.assignee].name) } },
      createdAt: new Date(row.createdAt.getTime() + 60_000),
    };
    activity.push(assigned);
    if (assigneeId !== owner) {
      notifications.push({
        userId: assigneeId,
        type: 'assigned',
        taskId: row.id,
        actorId: owner,
        activityId: assigned.id,
        // Anu's stays unread (the switcher's dot); Dorj's was read.
        readAt: def.assignee === 'anu' ? null : new Date(assigned.createdAt.getTime() + 3_600_000),
        createdAt: assigned.createdAt,
      });
    }
    if (def.status !== 'todo') {
      activity.push({
        ...base,
        actorId: assigneeId,
        id: uuidv7(),
        type: 'status.changed',
        payload: { from: snapshot('todo'), to: snapshot(def.status) },
        createdAt: at(def.hoursAgo),
      });
    }
  }

  return {
    workspace: { id: workspaceId, name: LABS.name, slug: LABS.slug, createdAt: joinedAt },
    holidays: MN_PUBLIC_HOLIDAYS_2026.map((h) => ({ workspaceId, ...h })),
    members: MEMBERS.map(({ ref, role }) => ({
      workspaceId,
      userId: userId(ref),
      role,
      title: PEOPLE[ref].title,
      capacityPoints: PEOPLE[ref].capacity,
      joinedAt,
    })),
    spaces: [space],
    projects: [project],
    projectMembers: MEMBERS.map(({ ref }) => ({ projectId: project.id, userId: userId(ref) })),
    statuses,
    tasks: tasks.map((t) => t.row),
    periods,
    assignees: tasks.map(({ def, row }) => ({ taskId: row.id, userId: userId(def.assignee) })),
    followers,
    activity,
    notifications,
  };
}
