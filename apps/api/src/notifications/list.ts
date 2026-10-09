import type { InboxTab, Notification, NotificationPage } from '@kite/shared';
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import { activity, comments, notifications, projects, tasks, users } from '../db/schema/index.js';
import { toHistoryEntry } from '../tasks/feed.js';
import { userRefColumns } from '../tasks/user-ref.js';
import { afterCursor, page } from './cursor.js';
import {
  commentOfActivity,
  projectRefColumns,
  snippetFor,
  taskRefColumns,
  toTaskRef,
} from './display.js';

/** Tasks of the workspace that are not in the trash. */
export const liveTasksOf = (workspaceId: string) =>
  sql`${notifications.taskId} in (
    select ${tasks.id} from ${tasks}
    join ${projects} on ${projects.id} = ${tasks.projectId}
    where ${projects.workspaceId} = ${workspaceId} and ${tasks.deletedAt} is null)`;

const TAB_FILTER: Record<InboxTab, SQL | undefined> = {
  all: isNull(notifications.archivedAt),
  mentions: and(isNull(notifications.archivedAt), eq(notifications.type, 'mention')),
  assigned: and(isNull(notifications.archivedAt), eq(notifications.type, 'assigned')),
  archived: isNotNull(notifications.archivedAt),
};

export async function listNotifications(
  db: DbOrTx,
  log: FastifyBaseLogger,
  userId: string,
  query: { workspaceId: string; tab: InboxTab; cursor?: string | undefined; limit: number },
): Promise<NotificationPage> {
  const mine = and(eq(notifications.userId, userId), liveTasksOf(query.workspaceId));

  const [rows, [counts]] = await Promise.all([
    db
      .select({
        notification: notifications,
        task: taskRefColumns,
        project: projectRefColumns,
        actor: userRefColumns,
        activity: {
          id: activity.id,
          type: activity.type,
          payload: activity.payload,
          createdAt: activity.createdAt,
        },
        commentText: comments.bodyText,
      })
      .from(notifications)
      .innerJoin(tasks, eq(tasks.id, notifications.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(users, eq(users.id, notifications.actorId))
      .leftJoin(activity, eq(activity.id, notifications.activityId))
      .leftJoin(comments, commentOfActivity)
      .where(
        and(
          mine,
          TAB_FILTER[query.tab],
          afterCursor(query.cursor, notifications.createdAt, notifications.id),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.limit + 1),
    db
      .select({
        unread: sql<number>`(count(*) filter (where ${notifications.readAt} is null and ${notifications.archivedAt} is null))::int`,
        archived: sql<number>`(count(*) filter (where ${notifications.archivedAt} is not null))::int`,
      })
      .from(notifications)
      .where(mine),
  ]);

  const { items, nextCursor } = page(
    rows.map((r) => ({ ...r, id: r.notification.id, createdAt: r.notification.createdAt })),
    query.limit,
  );
  return {
    items: items.map((r): Notification => {
      const n = r.notification;
      return {
        id: n.id,
        type: n.type,
        task: toTaskRef(r.task, r.project),
        project: r.project,
        actor: r.actor,
        // The notifier always stores the activity's own actor, so `actor` is its actor too.
        activity: r.activity ? toHistoryEntry(r.activity, r.actor, log) : null,
        snippet: snippetFor(
          r.activity?.type,
          r.commentText,
          r.task.descriptionText,
          n.type === 'mention',
        ),
        readAt: n.readAt?.toISOString() ?? null,
        archivedAt: n.archivedAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      };
    }),
    nextCursor,
    counts: { unread: counts?.unread ?? 0, archived: counts?.archived ?? 0 },
  };
}
