import type { InboxTab, Notification, NotificationPage } from '@kite/shared';
import { and, desc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyBaseLogger } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import {
  activity,
  comments,
  notifications,
  projects,
  standupBlockers,
  standupEntries,
  standupGroupMembers,
  standupGroups,
  standupReplies,
  tasks,
  users,
} from '../db/schema/index.js';
import { toHistoryEntry } from '../tasks/feed.js';
import { userRefColumns } from '../tasks/user-ref.js';
import { afterCursor, page } from './cursor.js';
import {
  commentOfActivity,
  projectRefColumns,
  snippetFor,
  taskRefColumns,
  toTaskRef,
  truncate,
} from './display.js';

/** Tasks of the workspace that are not in the trash. */
export const liveTasksOf = (workspaceId: string) =>
  sql`${notifications.taskId} in (
    select ${tasks.id} from ${tasks}
    join ${projects} on ${projects.id} = ${tasks.projectId}
    where ${projects.workspaceId} = ${workspaceId} and ${tasks.deletedAt} is null)`;

/**
 * Standup notifications of the workspace's groups, while the recipient is still in the group
 * (standup content is for the group's members).
 */
const standupsOf = (workspaceId: string) =>
  sql`exists (
    select 1 from ${standupGroups}
    join ${standupGroupMembers} on ${standupGroupMembers.groupId} = ${standupGroups.id}
    where ${standupGroups.id} = ${notifications.standupGroupId}
      and ${standupGroups.workspaceId} = ${workspaceId}
      and ${standupGroupMembers.userId} = ${notifications.userId})`;

/** A recipient's notifications that belong to the workspace: live tasks and standup groups. */
export const notificationsIn = (workspaceId: string) =>
  or(liveTasksOf(workspaceId), standupsOf(workspaceId));

const TAB_FILTER: Record<InboxTab, SQL | undefined> = {
  all: isNull(notifications.archivedAt),
  mentions: and(isNull(notifications.archivedAt), eq(notifications.type, 'mention')),
  assigned: and(isNull(notifications.archivedAt), eq(notifications.type, 'assigned')),
  archived: isNotNull(notifications.archivedAt),
};

const entryAuthors = alias(users, 'entry_author');

export async function listNotifications(
  db: DbOrTx,
  log: FastifyBaseLogger,
  userId: string,
  query: {
    workspaceId: string;
    tab: InboxTab;
    cursor?: string | undefined;
    limit: number;
    projectId?: string | undefined;
  },
): Promise<NotificationPage> {
  const mine = and(eq(notifications.userId, userId), notificationsIn(query.workspaceId));

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
        groupName: standupGroups.name,
        entryAuthor: {
          id: entryAuthors.id,
          name: entryAuthors.name,
          initials: entryAuthors.initials,
          avatarColor: entryAuthors.avatarColor,
        },
        replyBody: standupReplies.body,
        blockerText: standupBlockers.text,
      })
      .from(notifications)
      .leftJoin(tasks, eq(tasks.id, notifications.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(users, eq(users.id, notifications.actorId))
      .leftJoin(activity, eq(activity.id, notifications.activityId))
      .leftJoin(comments, commentOfActivity)
      .leftJoin(standupGroups, eq(standupGroups.id, notifications.standupGroupId))
      .leftJoin(standupEntries, eq(standupEntries.id, notifications.standupEntryId))
      .leftJoin(entryAuthors, eq(entryAuthors.id, standupEntries.userId))
      .leftJoin(standupReplies, eq(standupReplies.id, notifications.standupReplyId))
      .leftJoin(standupBlockers, eq(standupBlockers.id, notifications.standupBlockerId))
      .where(
        and(
          mine,
          TAB_FILTER[query.tab],
          query.projectId ? eq(tasks.projectId, query.projectId) : undefined,
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
      const standup =
        n.standupGroupId && n.standupDate
          ? {
              groupId: n.standupGroupId,
              groupName: r.groupName ?? '',
              date: n.standupDate,
              entryId: n.standupEntryId,
              blockerId: n.standupBlockerId,
              entryAuthor: r.entryAuthor,
            }
          : null;
      const task = r.task && r.project ? toTaskRef(r.task, r.project) : null;
      return {
        id: n.id,
        type: n.type,
        task,
        project: task ? r.project : null,
        standup,
        actor: r.actor,
        // The notifier always stores the activity's own actor, so `actor` is its actor too.
        activity: r.activity && r.actor ? toHistoryEntry(r.activity, r.actor, log) : null,
        snippet: standup
          ? r.replyBody
            ? truncate(r.replyBody)
            : r.blockerText
              ? truncate(r.blockerText)
              : null
          : snippetFor(
              r.activity?.type,
              r.commentText,
              r.task?.descriptionText ?? '',
              n.type === 'mention',
            ),
        digest: n.type === 'standup_digest' ? n.data : null,
        readAt: n.readAt?.toISOString() ?? null,
        archivedAt: n.archivedAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      };
    }),
    nextCursor,
    counts: { unread: counts?.unread ?? 0, archived: counts?.archived ?? 0 },
  };
}
