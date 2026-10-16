import {
  notificationSchema,
  type ActivityFeedItem,
  type Notification,
  type NotificationPage,
  type NotificationType,
} from '@kite/shared';
import { FEED } from './home';
import { at } from './tasks';

// Inbox rows built from the My Tasks feed sample (same clock: 2026-10-08T03:00:00Z).

/** A notification about a task (the task and project are always there). */
type TaskNotification = Notification & {
  task: NonNullable<Notification['task']>;
  project: NonNullable<Notification['project']>;
};

let n = 0;
const nextId = () => {
  n += 1;
  return `01890000-0000-7000-8000-7${String(n).padStart(11, '0')}`;
};

function notification(
  item: ActivityFeedItem,
  type: NotificationType,
  extra: Partial<Pick<Notification, 'readAt' | 'archivedAt' | 'snippet'>> = {},
): TaskNotification {
  const parsed = notificationSchema.parse({
    id: nextId(),
    type,
    task: item.task,
    project: item.project,
    standup: null,
    actor: item.activity.actor,
    activity: item.activity,
    snippet: item.snippet,
    digest: null,
    readAt: null,
    archivedAt: null,
    createdAt: item.activity.createdAt,
    ...extra,
  });
  return { ...parsed, task: item.task, project: item.project };
}

/** A standup notification (no task) in the Mobile team on Oct 8. */
export function standupNotification(
  type: NotificationType,
  extra: Partial<Notification> = {},
): Notification {
  return notificationSchema.parse({
    id: nextId(),
    type,
    task: null,
    project: null,
    standup: {
      groupId: '01890000-0000-7000-8000-00000000c001',
      groupName: 'Mobile team',
      date: '2026-10-08',
      entryId: '01890000-0000-7000-8000-00000000c002',
      blockerId: null,
      entryAuthor: null,
    },
    actor: at(FEED, 0).activity.actor,
    activity: null,
    snippet: null,
    digest: null,
    readAt: null,
    archivedAt: null,
    createdAt: '2026-10-08T02:30:00.000Z',
    ...extra,
  });
}

export const MENTION = notification(at(FEED, 0), 'mention');
export const STATUS = notification(at(FEED, 1), 'status');
export const ASSIGNED = notification(at(FEED, 2), 'assigned', {
  readAt: '2026-10-07T00:00:00.000Z',
});
export const ARCHIVED = notification(at(FEED, 3), 'comment', {
  readAt: '2026-10-07T00:00:00.000Z',
  archivedAt: '2026-10-07T01:00:00.000Z',
});

export const page = (
  items: Notification[],
  counts: NotificationPage['counts'],
  nextCursor: string | null = null,
): NotificationPage => ({ items, nextCursor, counts });
