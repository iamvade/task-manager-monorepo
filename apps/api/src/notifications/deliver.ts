import type { NotificationType, StandupDigestData } from '@kite/shared';
import { and, desc, eq, gt, isNull, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import { notifications } from '../db/schema/index.js';

/** An unread notification of the same type on the same subject this recent absorbs the new one. */
export const COLLAPSE_WINDOW_MS = 5 * 60_000;

/** What a notification is about: a task, or a standup group's day (and an update in it). */
export type NotificationSubject =
  | { taskId: string }
  | {
      standupGroupId: string;
      standupDate: string;
      standupEntryId?: string | null;
      standupBlockerId?: string | null;
      standupReplyId?: string | null;
    };

export interface Delivery {
  userId: string;
  type: NotificationType;
  subject: NotificationSubject;
  actorId: string | null;
  activityId: string | null;
  data?: StandupDigestData | null;
  at: Date;
}

export interface Notified {
  id: string;
  userId: string;
  type: NotificationType;
  taskId: string | null;
  groupId: string | null;
  actorId: string | null;
}

/**
 * The collapse key: same recipient, type and task (or standup update) within the window, still
 * unread and unarchived. Reminders and digests (no update) never collapse.
 */
function collapseKey(d: Delivery): SQL | undefined {
  if ('taskId' in d.subject) return eq(notifications.taskId, d.subject.taskId);
  if (d.subject.standupEntryId) return eq(notifications.standupEntryId, d.subject.standupEntryId);
  return undefined;
}

/**
 * Writes notifications (inside the caller's transaction), each collapsing into a recent unread
 * one of the same type on the same subject: that one is bumped with the latest actor and source.
 */
export async function writeNotifications(
  tx: DbOrTx,
  deliveries: readonly Delivery[],
): Promise<Notified[]> {
  const notified: Notified[] = [];
  for (const d of deliveries) {
    const key = collapseKey(d);
    const [existing] = key
      ? await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, d.userId),
              key,
              eq(notifications.type, d.type),
              isNull(notifications.readAt),
              isNull(notifications.archivedAt),
              gt(notifications.createdAt, new Date(d.at.getTime() - COLLAPSE_WINDOW_MS)),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1)
          .for('update')
      : [];
    const latest = {
      actorId: d.actorId,
      activityId: d.activityId,
      createdAt: d.at,
      ...('taskId' in d.subject
        ? {}
        : {
            standupBlockerId: d.subject.standupBlockerId ?? null,
            standupReplyId: d.subject.standupReplyId ?? null,
          }),
    };
    let id = existing?.id;
    if (id) {
      await tx.update(notifications).set(latest).where(eq(notifications.id, id));
    } else {
      const [row] = await tx
        .insert(notifications)
        .values({ userId: d.userId, type: d.type, ...d.subject, ...latest, data: d.data ?? null })
        .returning({ id: notifications.id });
      id = row?.id;
    }
    if (id) {
      notified.push({
        id,
        userId: d.userId,
        type: d.type,
        taskId: 'taskId' in d.subject ? d.subject.taskId : null,
        groupId: 'taskId' in d.subject ? null : d.subject.standupGroupId,
        actorId: d.actorId,
      });
    }
  }
  return notified;
}

/** Pushes `notification.created` to each recipient (after the notifications committed). */
export function publishNotified(
  app: FastifyInstance,
  workspaceId: string,
  notified: readonly Notified[],
): void {
  for (const n of notified) {
    app.realtime.broadcaster.publish({
      to: { userId: n.userId, workspaceId },
      message: {
        type: 'notification.created',
        workspaceId,
        taskId: n.taskId,
        groupId: n.groupId,
        actorId: n.actorId,
        notificationId: n.id,
        notificationType: n.type,
      },
    });
  }
}
