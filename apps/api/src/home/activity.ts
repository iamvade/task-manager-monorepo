import type { ActivityFeedItem, ActivityPage, NotificationType } from '@kite/shared';
import { and, desc, eq, exists, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import {
  activity,
  comments,
  projects,
  taskAssignees,
  taskFollowers,
  tasks,
  users,
} from '../db/schema/index.js';
import { afterCursor, page } from '../notifications/cursor.js';
import {
  commentOfActivity,
  projectRefColumns,
  snippetFor,
  taskRefColumns,
  toTaskRef,
} from '../notifications/display.js';
import { toHistoryEntry } from '../tasks/feed.js';
import { userRefColumns } from '../tasks/user-ref.js';

/**
 * "Recent activity" on My Tasks: what others did on tasks I'm assigned to or follow, newest
 * first. A line is unread while my notification for that activity row is.
 */
export async function listMyActivity(
  db: DbOrTx,
  log: FastifyBaseLogger,
  userId: string,
  query: { workspaceId: string; cursor?: string | undefined; limit: number },
): Promise<ActivityPage> {
  const rows = await db
    .select({
      activity: {
        id: activity.id,
        type: activity.type,
        payload: activity.payload,
        createdAt: activity.createdAt,
      },
      actor: userRefColumns,
      task: taskRefColumns,
      project: projectRefColumns,
      commentText: comments.bodyText,
      notificationType: sql<NotificationType | null>`(
        select n.type from notifications n
        where n.activity_id = ${activity.id} and n.user_id = ${userId}
        order by n.created_at desc limit 1)`,
      unread: sql<boolean>`exists(
        select 1 from notifications n
        where n.activity_id = ${activity.id} and n.user_id = ${userId}
          and n.read_at is null and n.archived_at is null)`,
    })
    .from(activity)
    .innerJoin(tasks, eq(tasks.id, activity.taskId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(users, eq(users.id, activity.actorId))
    .leftJoin(comments, commentOfActivity)
    .where(
      and(
        eq(activity.workspaceId, query.workspaceId),
        isNull(tasks.deletedAt),
        ne(activity.actorId, userId),
        or(
          exists(
            db
              .select({ one: sql`1` })
              .from(taskAssignees)
              .where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, userId))),
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(taskFollowers)
              .where(and(eq(taskFollowers.taskId, tasks.id), eq(taskFollowers.userId, userId))),
          ),
        ),
        afterCursor(query.cursor, activity.createdAt, activity.id),
      ),
    )
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(query.limit + 1);

  const { items, nextCursor } = page(
    rows.map((r) => ({ ...r, id: r.activity.id, createdAt: r.activity.createdAt })),
    query.limit,
  );
  return {
    items: items.flatMap((r): ActivityFeedItem[] => {
      const entry = toHistoryEntry(r.activity, r.actor, log);
      if (!entry) return [];
      return [
        {
          activity: entry,
          task: toTaskRef(r.task, r.project),
          project: r.project,
          notificationType: r.notificationType,
          snippet: snippetFor(
            r.activity.type,
            r.commentText,
            r.task.descriptionText,
            r.notificationType === 'mention',
          ),
          unread: r.unread,
        },
      ];
    }),
    nextCursor,
  };
}
