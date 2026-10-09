import type { Comment, CommentReply, RichTextNode } from '@kite/shared';
import { extractMentionIds, richTextToPlain } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { comments, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { userRefColumns } from './user-ref.js';

type CommentRow = typeof comments.$inferSelect;

/** Plain text and mentioned user ids of a comment body; 400 when it says nothing. */
export function parseCommentBody(body: RichTextNode) {
  const text = richTextToPlain(body);
  const mentionIds = extractMentionIds(body);
  if (text.trim() === '' && mentionIds.length === 0) {
    throw httpError(400, 'EMPTY_COMMENT', 'Comment is empty');
  }
  return { text, mentionIds };
}

function toReply(row: CommentRow, author: CommentReply['author']): CommentReply {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    taskId: row.taskId,
    parentId: row.parentId,
    author,
    body: deleted ? null : row.body,
    bodyText: deleted ? '' : row.bodyText,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function selectComments(db: DbOrTx, taskId: string) {
  return db
    .select({ comment: comments, author: userRefColumns })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

/**
 * Comment threads of a task, oldest first, replies nested (oldest first). Deleted replies are
 * left out; a deleted top-level comment stays as a tombstone (`body: null`) while it has live
 * replies, otherwise it is left out too.
 */
export async function listComments(db: DbOrTx, taskId: string): Promise<Comment[]> {
  const rows = await selectComments(db, taskId);
  const replies = new Map<string, CommentReply[]>();
  for (const { comment, author } of rows) {
    if (!comment.parentId || comment.deletedAt) continue;
    const list = replies.get(comment.parentId) ?? [];
    list.push(toReply(comment, author));
    replies.set(comment.parentId, list);
  }
  return rows
    .filter(({ comment }) => !comment.parentId)
    .map(({ comment, author }) => ({
      ...toReply(comment, author),
      replies: replies.get(comment.id) ?? [],
    }))
    .filter((c) => c.deletedAt === null || c.replies.length > 0);
}

/** One comment as returned by create/edit (a top-level one with its replies). */
export async function getComment(db: DbOrTx, commentId: string): Promise<Comment> {
  const [row] = await db
    .select({ comment: comments, author: userRefColumns })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, commentId));
  if (!row) throw httpError(404, 'NOT_FOUND', 'Comment not found');
  if (row.comment.parentId) return { ...toReply(row.comment, row.author), replies: [] };
  const thread = (await listComments(db, row.comment.taskId)).find((c) => c.id === commentId);
  return thread ?? { ...toReply(row.comment, row.author), replies: [] };
}
