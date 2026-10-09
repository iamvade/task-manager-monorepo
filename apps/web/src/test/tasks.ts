import {
  projectDetailSchema,
  taskListItemSchema,
  type Priority,
  type StatusCategory,
  type TaskListItem,
} from '@kite/shared';
import { PROJECT, PROJECT_ID, SPACE_ID, SPRINT_ID, WORKSPACE_ID } from './fixtures';

/** `list[i]`, failing loudly instead of a non-null assertion. */
export function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`No item at ${String(i)}`);
  return item;
}

const id = (prefix: string, n: number) =>
  `01890000-0000-7000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`;

export const STATUSES = (['todo', 'in_progress', 'review', 'done'] as const).map((category, i) => ({
  id: id('5', i + 1),
  name: null,
  category,
  color: null,
  position: `a${String(i)}`,
}));
export const statusOf = (category: StatusCategory) =>
  at(
    STATUSES.filter((s) => s.category === category),
    0,
  );

/** PROJECT with its four default statuses (what `GET /projects/:id` returns). */
export const PROJECT_WITH_STATUSES = projectDetailSchema.parse({ ...PROJECT, statuses: STATUSES });

const users = Object.fromEntries(PROJECT.members.map((m) => [m.user.initials, m.user]));
const ref = (initials: string) => {
  const user = users[initials];
  if (!user) throw new Error(`No member ${initials}`);
  return { id: user.id, name: user.name, initials, avatarColor: user.avatarColor };
};

export const TAGS = [
  { id: id('7', 1), name: 'Research', color: 'blue' },
  { id: id('7', 2), name: 'UX', color: 'violet' },
];

let seq = 0;
export function makeTask(
  title: string,
  category: StatusCategory,
  fields: {
    assignees?: string[];
    due?: string | null;
    priority?: Priority;
    tags?: number[];
    subtasks?: [number, number];
    comments?: number;
  } = {},
): TaskListItem {
  seq += 1;
  const status = statusOf(category);
  return taskListItemSchema.parse({
    id: id('6', seq),
    key: `APP-${String(130 + seq)}`,
    number: 130 + seq,
    project: {
      id: PROJECT_ID,
      spaceId: SPACE_ID,
      key: 'APP',
      name: 'App Redesign',
      color: 'violet',
    },
    status: { id: status.id, name: null, category, color: null },
    title,
    priority: fields.priority ?? 'none',
    startDate: null,
    dueDate: fields.due ?? null,
    position: `a${String(seq)}`,
    sprintId: SPRINT_ID,
    completedAt: category === 'done' ? '2026-10-05T03:00:00.000Z' : null,
    createdAt: `2026-10-01T0${String(seq % 10)}:00:00.000Z`,
    updatedAt: '2026-10-07T03:00:00.000Z',
    assignees: (fields.assignees ?? []).map(ref),
    tags: (fields.tags ?? []).map((i) => at(TAGS, i)),
    subtaskProgress: { done: fields.subtasks?.[0] ?? 0, total: fields.subtasks?.[1] ?? 0 },
    commentCount: fields.comments ?? 0,
    attachmentCount: 0,
  });
}

/** A small App Redesign list (today = 2026-10-08): 7 tasks, 1 done. */
export function makeTasks(): TaskListItem[] {
  seq = 0;
  return [
    makeTask('Audit current navigation patterns', 'todo', {
      assignees: ['TG'],
      due: '2026-10-14',
      priority: 'medium',
      tags: [0, 1],
      subtasks: [0, 4],
      comments: 2,
    }),
    makeTask('Define color tokens for dark mode', 'todo', {
      assignees: ['SK'],
      due: '2026-10-16',
      priority: 'low',
      subtasks: [1, 6],
    }),
    makeTask('Implement new bottom tab bar', 'in_progress', {
      assignees: ['DE', 'TG'],
      due: '2026-10-10',
      priority: 'urgent',
    }),
    makeTask('Redesign onboarding flow', 'in_progress', {
      assignees: ['AB', 'SK'],
      due: '2026-10-12',
      priority: 'high',
      subtasks: [2, 3],
      comments: 7,
    }),
    makeTask('Checkout page — responsive layout', 'review', {
      assignees: ['AB', 'DE'],
      due: '2026-10-08',
      priority: 'urgent',
    }),
    makeTask('Accessibility pass on primary buttons', 'review', {
      assignees: ['ML'],
      due: '2026-10-07',
      priority: 'high',
    }),
    makeTask('Release notes', 'done', { assignees: ['AB'], due: '2026-10-05' }),
  ];
}

/** Handlers for everything the List view loads besides the shell. */
export function listHandlers(tasks: () => TaskListItem[] = makeTasks) {
  return {
    [`GET /api/v1/projects/${PROJECT_ID}`]: () => Response.json(PROJECT_WITH_STATUSES),
    [`GET /api/v1/projects/${PROJECT_ID}/tasks`]: () => Response.json(tasks()),
    [`GET /api/v1/projects/${PROJECT_ID}/sprints`]: () => Response.json([PROJECT.activeSprint]),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () => Response.json(PROJECT.members),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/tags`]: () => Response.json(TAGS),
  };
}
