import {
  NOTIFICATION_TYPES,
  activityPayloadSchemas,
  type NotificationPrefs,
  type NotificationType,
} from '@kite/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { activity, taskFollowers } from '../db/schema/index.js';
import type { TaskEvent } from '../events/bus.js';

/** A reason to notify someone about one event. */
export interface Candidate {
  type: NotificationType;
  /** The activity row behind it (null when there is none to point at). */
  activityId: string | null;
}

/** Highest first: a recipient gets one notification per event, of the best type they enabled. */
const RANK: Record<NotificationType, number> = Object.fromEntries(
  NOTIFICATION_TYPES.map((type, i) => [type, i]),
) as Record<NotificationType, number>;

/**
 * Everyone an event could notify, with every reason that applies to them. The actor, non-members
 * and preferences are filtered later.
 */
export async function candidatesFor(
  db: DbOrTx,
  event: TaskEvent,
): Promise<Map<string, Candidate[]>> {
  const out = new Map<string, Candidate[]>();
  const add = (userId: string, candidate: Candidate) => {
    const list = out.get(userId);
    if (list) list.push(candidate);
    else out.set(userId, [candidate]);
  };
  const activityOf = (type: string) => event.activities.find((a) => a.type === type)?.id ?? null;
  const followers = async () =>
    (
      await db
        .select({ userId: taskFollowers.userId })
        .from(taskFollowers)
        .where(eq(taskFollowers.taskId, event.taskId))
    ).map((r) => r.userId);

  switch (event.type) {
    case 'task.created': {
      const created = activityOf('task.created');
      for (const id of event.mentionedUserIds ?? [])
        add(id, { type: 'mention', activityId: created });
      for (const id of event.assigneeIds ?? []) add(id, { type: 'assigned', activityId: created });
      break;
    }
    case 'task.updated':
    case 'task.moved': {
      const description = activityOf('description.changed');
      for (const id of event.mentionedUserIds ?? []) {
        add(id, { type: 'mention', activityId: description });
      }
      for (const a of event.activities) {
        if (a.type !== 'assignee.added') continue;
        const parsed = activityPayloadSchemas['assignee.added'].safeParse(a.payload);
        if (parsed.success) add(parsed.data.user.id, { type: 'assigned', activityId: a.id });
      }
      const status = activityOf('status.changed');
      if (status)
        for (const id of await followers()) add(id, { type: 'status', activityId: status });
      break;
    }
    case 'comment.created': {
      const added = activityOf('comment.added');
      for (const id of event.mentionedUserIds ?? [])
        add(id, { type: 'mention', activityId: added });
      for (const id of await followers()) add(id, { type: 'comment', activityId: added });
      break;
    }
    case 'comment.updated': {
      // An edit writes no activity; point at the comment's `comment.added` row instead.
      if (!event.mentionedUserIds?.length || !event.commentId) break;
      const [row] = await db
        .select({ id: activity.id })
        .from(activity)
        .where(
          and(
            eq(activity.taskId, event.taskId),
            eq(activity.type, 'comment.added'),
            sql`${activity.payload} ->> 'commentId' = ${event.commentId}`,
          ),
        )
        .limit(1);
      for (const id of event.mentionedUserIds) {
        add(id, { type: 'mention', activityId: row?.id ?? null });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** The best reason the recipient has enabled; undefined when they turned all of them off. */
export function pickCandidate(
  candidates: readonly Candidate[],
  prefs: NotificationPrefs,
): Candidate | undefined {
  return candidates.filter((c) => prefs[c.type]).sort((a, b) => RANK[a.type] - RANK[b.type])[0];
}
