import { shortName, type Notification } from '@kite/shared';
import { feedLine, type FeedKey, type FeedLine } from '../my-tasks/feedLine';

type Formatters = Parameters<typeof feedLine>[1];

/** The line when the activity behind a notification can't be shown. */
const FALLBACK: Record<Notification['type'], FeedKey> = {
  mention: 'mentioned',
  assigned: 'assigned',
  comment: 'commented',
  status: 'updated',
  // Standup notifications use `standupLine` instead.
  standup_help: 'updated',
  standup_reply: 'updated',
  standup_resolved: 'updated',
  standup_reminder: 'updated',
  standup_digest: 'updated',
};

/**
 * The sentence for one inbox row, worded like the My Tasks feed ("Sara K. mentioned you in
 * APP-142"): the activity behind it read through `feedLine`, with the task named by its key.
 * The type wins over the activity for mentions and assignments, which is why I was notified.
 */
export function inboxLine(n: Notification, formatters: Formatters): FeedLine {
  const base =
    n.activity && n.task && n.project
      ? feedLine(
          {
            activity: n.activity,
            task: n.task,
            project: n.project,
            notificationType: n.type,
            snippet: n.snippet,
            unread: n.readAt === null,
          },
          formatters,
        )
      : { key: FALLBACK[n.type], values: { actor: '', task: '' } };
  const key = n.type === 'mention' || n.type === 'assigned' ? FALLBACK[n.type] : base.key;
  const values = {
    ...base.values,
    actor: n.actor ? shortName(n.actor.name) : '',
    task: n.task?.key ?? '',
  };
  return { key, values };
}
