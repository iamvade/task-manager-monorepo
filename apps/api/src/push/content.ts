import {
  formatTaskKey,
  pushText,
  statusSnapshotSchema,
  wsPath,
  type Locale,
  type PushPayload,
} from '@kite/shared';
import { eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client.js';
import {
  activity,
  comments,
  notifications,
  projects,
  standupBlockers,
  standupGroups,
  standupReplies,
  tasks,
  users,
} from '../db/schema/index.js';
import { commentOfActivity, snippetFor, truncate } from '../notifications/display.js';

/** Shorter than the Inbox's snippet: a popup shows two or three lines. */
const PUSH_SNIPPET_LENGTH = 140;

export interface PushItem {
  userId: string;
  locale: Locale;
  payload: PushPayload;
}

const actors = alias(users, 'actor');

/**
 * Reads committed notifications back with what their push says (in each recipient's language)
 * and where it leads: the task page, or the standup group's day (a reminder opens the write
 * form). A notification whose task is gone by now is skipped.
 */
export async function loadPushItems(
  db: DbOrTx,
  workspace: { id: string; slug: string },
  notificationIds: readonly string[],
): Promise<PushItem[]> {
  if (notificationIds.length === 0) return [];
  const rows = await db
    .select({
      n: notifications,
      locale: users.locale,
      actorName: actors.name,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      taskDescription: tasks.descriptionText,
      taskDeletedAt: tasks.deletedAt,
      projectKey: projects.key,
      activityType: activity.type,
      activityPayload: activity.payload,
      commentText: comments.bodyText,
      groupName: standupGroups.name,
      replyBody: standupReplies.body,
      blockerText: standupBlockers.text,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(actors, eq(actors.id, notifications.actorId))
    .leftJoin(tasks, eq(tasks.id, notifications.taskId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(activity, eq(activity.id, notifications.activityId))
    .leftJoin(comments, commentOfActivity)
    .leftJoin(standupGroups, eq(standupGroups.id, notifications.standupGroupId))
    .leftJoin(standupReplies, eq(standupReplies.id, notifications.standupReplyId))
    .leftJoin(standupBlockers, eq(standupBlockers.id, notifications.standupBlockerId))
    .where(inArray(notifications.id, [...notificationIds]));

  return rows.flatMap((r): PushItem[] => {
    const n = r.n;
    const isTask = n.taskId !== null;
    if (isTask && (r.taskNumber === null || r.projectKey === null || r.taskDeletedAt !== null)) {
      return [];
    }
    if (!isTask && (r.groupName === null || n.standupGroupId === null || !n.standupDate)) {
      return [];
    }
    const key = isTask ? formatTaskKey(r.projectKey ?? '', r.taskNumber ?? 0) : '';

    let statusTo = null;
    if (r.activityType === 'status.changed') {
      const parsed = statusSnapshotSchema.safeParse((r.activityPayload as { to?: unknown }).to);
      statusTo = parsed.success ? parsed.data : null;
    }
    const rawSnippet = isTask
      ? snippetFor(r.activityType, r.commentText, r.taskDescription ?? '', n.type === 'mention')
      : (r.replyBody ?? r.blockerText);
    const digest =
      n.type === 'standup_digest' && n.data
        ? { posted: n.data.posted.length, expected: n.data.posted.length + n.data.notPosted.length }
        : null;

    const { title, body } = pushText(
      {
        type: n.type,
        actorName: r.actorName,
        task: isTask ? { key, title: r.taskTitle ?? '' } : null,
        activityType: r.activityType,
        statusTo,
        standup: isTask ? null : { groupName: r.groupName ?? '', onBlocker: !!n.standupBlockerId },
        digest,
        snippet: rawSnippet ? truncate(rawSnippet, PUSH_SNIPPET_LENGTH) : null,
      },
      r.locale,
    );

    // Same targets as the Inbox (`standupHref` on the web).
    const path = isTask
      ? `/t/${key}`
      : n.type === 'standup_reminder'
        ? `/standup/${n.standupGroupId}?write=1`
        : `/standup/${n.standupGroupId}/${n.standupDate}`;

    return [
      {
        userId: n.userId,
        locale: r.locale,
        payload: {
          v: 1,
          id: n.id,
          workspaceId: workspace.id,
          title,
          body,
          url: wsPath(workspace.slug, path),
        },
      },
    ];
  });
}
