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

let n = 0;
function notification(
  item: ActivityFeedItem,
  type: NotificationType,
  extra: Partial<Pick<Notification, 'readAt' | 'archivedAt' | 'snippet'>> = {},
): Notification {
  n += 1;
  return notificationSchema.parse({
    id: `01890000-0000-7000-8000-7${String(n).padStart(11, '0')}`,
    type,
    task: item.task,
    project: item.project,
    actor: item.activity.actor,
    activity: item.activity,
    snippet: item.snippet,
    readAt: null,
    archivedAt: null,
    createdAt: item.activity.createdAt,
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
