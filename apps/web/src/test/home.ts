import {
  activityFeedItemSchema,
  homeSchema,
  type ActivityFeedItem,
  type MyTask,
  type Priority,
} from '@kite/shared';
import { ME, PROJECT, PROJECT_ID, SPACE_ID } from './fixtures';
import { statusOf } from './tasks';

// My Tasks as GET /me/home returns it on Thursday Oct 8 2026, 11:00 in Ulaanbaatar
// (MyTasks.dc.html sample data). Tests pin the clock to 2026-10-08T03:00:00Z.

export const HOME_NOW = new Date('2026-10-08T03:00:00Z');

const id = (prefix: string, n: number) =>
  `01890000-0000-7000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`;

const project = {
  id: PROJECT_ID,
  spaceId: SPACE_ID,
  key: 'APP',
  name: 'App Redesign',
  color: 'violet',
} as const;
const space = { id: SPACE_ID, initial: 'P', color: 'violet' } as const;

let n = 0;
export function myTask(
  title: string,
  dueDate: string | null,
  priority: Priority,
  done = false,
): MyTask {
  n += 1;
  const status = statusOf(done ? 'done' : 'todo');
  return {
    id: id('9', n),
    key: `APP-${String(100 + n)}`,
    title,
    priority,
    dueDate,
    done,
    completedAt: done ? '2026-10-08T01:00:00.000Z' : null,
    status: { id: status.id, name: null, category: status.category, color: null },
    project,
    space,
  };
}

const member = (initials: string) => {
  const m = PROJECT.members.find((x) => x.user.initials === initials);
  if (!m) throw new Error(`No member ${initials}`);
  const { id: userId, name, avatarColor } = m.user;
  return { id: userId, name, initials, avatarColor };
};

const snapshot = (category: 'review' | 'done' | 'in_progress') => {
  const s = statusOf(category);
  return { id: s.id, name: null, category: s.category };
};

let a = 0;
function feedItem(
  actor: string,
  task: MyTask,
  createdAt: string,
  activity: { type: string; payload: Record<string, unknown> },
  extra: Partial<Pick<ActivityFeedItem, 'notificationType' | 'snippet' | 'unread'>> = {},
) {
  a += 1;
  return {
    activity: { kind: 'history', id: id('8', a), actor: member(actor), createdAt, ...activity },
    task: { id: task.id, key: task.key, number: Number(task.key.slice(4)), title: task.title },
    project,
    notificationType: null,
    snippet: null,
    unread: false,
    ...extra,
  };
}

export const OVERDUE = [
  myTask('Review onboarding copy with Sara', '2026-10-06', 'high'),
  myTask('Approve Q4 roadmap priorities', '2026-10-07', 'urgent'),
] as const;
export const TODAY = [
  myTask('Finalize checkout empty states', '2026-10-08', 'urgent'),
  myTask('Write release notes for 2.4', '2026-10-08', 'medium'),
  myTask('Prepare sprint demo', '2026-10-08', 'low'),
  myTask('Tab bar scope check-in with Temuulen', '2026-10-08', 'medium', true),
] as const;
export const THIS_WEEK = [
  myTask('Usability test synthesis', '2026-10-09', 'high'),
  myTask('Update icon set', '2026-10-09', 'low'),
] as const;
export const LATER = [
  myTask('Plan Q1 research', '2026-10-12', 'medium'),
  myTask('Clean up design tokens', null, 'none'),
] as const;
/** Completed this week, latest first (the done one due today is listed in both). */
export const DONE = [
  TODAY[3],
  myTask('Ship onboarding survey', '2026-10-06', 'medium', true),
] as const;

export const FEED: ActivityFeedItem[] = activityFeedItemSchema.array().parse([
  feedItem(
    'DE',
    OVERDUE[0],
    '2026-10-08T01:00:00.000Z',
    { type: 'comment.added', payload: { commentId: id('6', 1) } },
    { notificationType: 'mention', snippet: 'Can you take a look before standup?', unread: true },
  ),
  feedItem(
    'BO',
    TODAY[0],
    '2026-10-07T08:00:00.000Z',
    { type: 'status.changed', payload: { from: snapshot('in_progress'), to: snapshot('review') } },
    { notificationType: 'status', unread: true },
  ),
  feedItem('TG', THIS_WEEK[0], '2026-10-06T05:00:00.000Z', {
    type: 'assignee.added',
    payload: { user: { id: ME.user.id, name: ME.user.name } },
  }),
  feedItem('ON', LATER[0], '2026-10-06T04:00:00.000Z', {
    type: 'due.changed',
    payload: { from: '2026-10-09', to: '2026-10-15' },
  }),
  feedItem('ML', TODAY[1], '2026-10-05T04:00:00.000Z', {
    type: 'priority.changed',
    payload: { from: 'low', to: 'medium' },
  }),
]);

export const OLDER_FEED: ActivityFeedItem[] = activityFeedItemSchema.array().parse([
  feedItem('SK', TODAY[2], '2026-10-04T04:00:00.000Z', {
    type: 'status.changed',
    payload: { from: snapshot('review'), to: snapshot('done') },
  }),
]);

export const HOME = homeSchema.parse({
  today: '2026-10-08',
  timezone: 'Asia/Ulaanbaatar',
  weekStart: '2026-10-05',
  sections: { overdue: OVERDUE, today: TODAY, thisWeek: THIS_WEEK, later: LATER, done: DONE },
  stats: {
    dueToday: { open: 3, total: 4, urgent: 1 },
    completedThisWeek: { count: 7, delta: 3, perDay: [2, 3, 1, 1, 0, 0, 0] },
    overdue: { count: 2, oldestDaysLate: 2 },
  },
  activity: { items: FEED, nextCursor: 'cursor-1' },
});

/** GET /me/home for tests that land on /my-tasks. */
export const homeHandlers = () => ({ 'GET /api/v1/me/home': () => Response.json(HOME) });
