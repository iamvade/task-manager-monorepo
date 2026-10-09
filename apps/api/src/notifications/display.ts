import { formatTaskKey, type TaskProjectRef, type TaskRef } from '@kite/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { activity, comments, projects, tasks } from '../db/schema/index.js';

// Shared pieces of the Inbox list and the My Tasks activity feed.

export const SNIPPET_LENGTH = 200;

export function truncate(text: string, max = SNIPPET_LENGTH): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Left-join condition: the comment a `comment.added` row points at, unless it was deleted. */
export const commentOfActivity = and(
  eq(activity.type, 'comment.added'),
  sql`${comments.id} = (${activity.payload} ->> 'commentId')::uuid`,
  isNull(comments.deletedAt),
);

export const taskRefColumns = {
  id: tasks.id,
  number: tasks.number,
  title: tasks.title,
  descriptionText: tasks.descriptionText,
};

export const projectRefColumns = {
  id: projects.id,
  spaceId: projects.spaceId,
  key: projects.key,
  name: projects.name,
  color: projects.color,
};

export function toTaskRef(
  task: { id: string; number: number; title: string },
  project: TaskProjectRef,
): TaskRef {
  return {
    id: task.id,
    key: formatTaskKey(project.key, task.number),
    number: task.number,
    title: task.title,
  };
}

/**
 * Text quoted under a line: the comment for comment activity, the description for a mention in
 * it (task created / description changed).
 */
export function snippetFor(
  activityType: string | null | undefined,
  commentText: string | null | undefined,
  descriptionText: string,
  mention: boolean,
): string | null {
  if (activityType === 'comment.added') return commentText ? truncate(commentText) : null;
  if (mention && (activityType === 'task.created' || activityType === 'description.changed')) {
    return truncate(descriptionText);
  }
  return null;
}
