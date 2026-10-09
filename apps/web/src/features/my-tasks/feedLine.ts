import { shortName, type ActivityFeedItem, type StatusSnapshot } from '@kite/shared';
import type { TFunction } from 'i18next';

/** i18n key under `myTasks.feed` of one Recent activity line. */
export type FeedKey =
  'mentioned' | 'commented' | 'statusChanged' | 'completed' | 'assigned' | 'dueChanged' | 'updated';

export interface FeedLine {
  key: FeedKey;
  /** `actor` and `task` always; `status` / `date` for the lines that name them. */
  values: Record<string, string>;
}

interface Formatters {
  t: TFunction;
  formatDate: (date: string) => string;
  /** Activity about this user reads "assigned you". */
  meId: string | undefined;
}

/**
 * The sentence for one feed item (MyTasks.dc.html): a comment is a mention when my notification
 * for it was one; a move into Done reads "completed"; changes without a line of their own read
 * "updated <task>".
 */
export function feedLine(item: ActivityFeedItem, { t, formatDate, meId }: Formatters): FeedLine {
  const { activity } = item;
  const values = { actor: shortName(activity.actor.name), task: item.task.title };
  const statusName = (s: StatusSnapshot) => s.name ?? t(`status.${s.category}`);

  switch (activity.type) {
    case 'comment.added':
      return { key: item.notificationType === 'mention' ? 'mentioned' : 'commented', values };
    case 'status.changed': {
      const { to } = activity.payload;
      return to.category === 'done'
        ? { key: 'completed', values }
        : { key: 'statusChanged', values: { ...values, status: statusName(to) } };
    }
    case 'assignee.added':
      if (activity.payload.user.id === meId) return { key: 'assigned', values };
      break;
    case 'due.changed':
      if (activity.payload.to) {
        return { key: 'dueChanged', values: { ...values, date: formatDate(activity.payload.to) } };
      }
      break;
    case 'description.changed':
      // A mention in the description notifies like a comment mention.
      if (item.notificationType === 'mention') return { key: 'mentioned', values };
      break;
    default:
      break;
  }
  return { key: 'updated', values };
}
