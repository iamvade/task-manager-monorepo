import {
  apiErrorSchema,
  commentSchema,
  createCommentSchema,
  extractMentionIds,
  updateCommentSchema,
} from '@kite/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadCommentAccess, loadTaskAccess, roleAtLeast } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { one } from '../db/rows.js';
import { comments } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { getComment, listComments, parseCommentBody } from '../tasks/comments.js';
import { follow, workspaceMemberIds } from '../tasks/followers.js';
import { stableJson } from '../tasks/json.js';
import { mutateTasks, type TaskMutation } from '../tasks/mutation.js';

const err = apiErrorSchema;
const taskParams = z.object({ taskId: z.uuid() });
const commentParams = z.object({ commentId: z.uuid() });

export const commentRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** Re-reads and locks a live comment inside a mutation (it may have been deleted meanwhile). */
  async function lockComment(m: TaskMutation, taskId: string, commentId: string) {
    await m.lockTask(taskId);
    const [comment] = await m.tx
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
      .for('update');
    if (!comment) throw httpError(404, 'NOT_FOUND', 'Comment not found');
    return comment;
  }

  app.get(
    '/tasks/:taskId/comments',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Comments'],
        summary: 'List comments',
        description:
          'Top-level comments oldest first, each with its replies (one level). A deleted comment with live replies stays as a tombstone (`body: null`); other deleted comments are left out.',
        params: taskParams,
        response: { 200: z.array(commentSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { task } = await loadTaskAccess(request, request.params.taskId);
      return listComments(app.db, task.id);
    },
  );

  app.post(
    '/tasks/:taskId/comments',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Comments'],
        summary: 'Add a comment or reply',
        description:
          "Body is a TipTap document; its plain text and @mentions (mention nodes' `attrs.id`) are extracted on the server. Mentions of non-members are ignored. The author and mentioned members follow the task. `parentId` must be a live comment of this task (400 `INVALID_PARENT`); replying to a reply joins its thread. 400 `EMPTY_COMMENT` without text or mentions. Logs `comment.added`.",
        params: taskParams,
        body: createCommentSchema,
        response: { 201: commentSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { task, project } = await loadTaskAccess(request, request.params.taskId);
      const { user } = requireAuth(request);
      const { body, parentId } = request.body;
      const { text, mentionIds } = parseCommentBody(body);

      const id = await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        await m.lockTask(task.id);
        let rootId: string | null = null;
        if (parentId) {
          const [parent] = await m.tx
            .select()
            .from(comments)
            .where(
              and(
                eq(comments.id, parentId),
                eq(comments.taskId, task.id),
                isNull(comments.deletedAt),
              ),
            );
          if (!parent) {
            throw httpError(400, 'INVALID_PARENT', 'Parent comment is not on this task');
          }
          rootId = parent.parentId ?? parent.id;
        }
        const mentioned = await workspaceMemberIds(m.tx, m.project.workspaceId, mentionIds);
        const comment = one(
          await m.tx
            .insert(comments)
            .values({
              taskId: task.id,
              authorId: user.id,
              parentId: rootId,
              body,
              bodyText: text,
              createdAt: m.now,
            })
            .returning({ id: comments.id }),
          'comment',
        );
        await follow(m.tx, task.id, [user.id, ...mentioned]);
        m.log(task.id, 'comment.added', { commentId: comment.id });
        await m.touch(task.id);
        m.emit('comment.created', task.id, {
          commentId: comment.id,
          mentionedUserIds: mentioned,
        });
        return comment.id;
      });
      return reply.code(201).send(await getComment(app.db, id));
    },
  );

  app.patch(
    '/comments/:commentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Comments'],
        summary: 'Edit a comment',
        description:
          'Own comments only (403 otherwise). Sets `editedAt`; an unchanged body is a no-op. Newly mentioned members follow the task.',
        params: commentParams,
        body: updateCommentSchema,
        response: { 200: commentSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { comment: found, project } = await loadCommentAccess(
        request,
        request.params.commentId,
      );
      const { user } = requireAuth(request);
      if (found.authorId !== user.id) {
        throw httpError(403, 'FORBIDDEN', 'You can only edit your own comments');
      }
      const { body } = request.body;
      const { text, mentionIds } = parseCommentBody(body);

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        const comment = await lockComment(m, found.taskId, found.id);
        if (stableJson(comment.body) === stableJson(body)) return;

        const before = new Set(extractMentionIds(comment.body));
        const added = await workspaceMemberIds(
          m.tx,
          m.project.workspaceId,
          mentionIds.filter((id) => !before.has(id)),
        );
        await m.tx
          .update(comments)
          .set({ body, bodyText: text, editedAt: m.now })
          .where(eq(comments.id, comment.id));
        await follow(m.tx, comment.taskId, added);
        m.emit('comment.updated', comment.taskId, {
          commentId: comment.id,
          mentionedUserIds: added,
        });
      });
      return getComment(app.db, found.id);
    },
  );

  app.delete(
    '/comments/:commentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Comments'],
        summary: 'Delete a comment',
        description:
          'Soft delete. The author or a workspace admin/owner (403 otherwise). Replies stay; the comment shows as deleted while it has any.',
        params: commentParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const {
        comment: found,
        project,
        role,
      } = await loadCommentAccess(request, request.params.commentId);
      const { user } = requireAuth(request);
      if (found.authorId !== user.id && !roleAtLeast(role, 'admin')) {
        throw httpError(403, 'FORBIDDEN', 'You can only delete your own comments');
      }

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        const comment = await lockComment(m, found.taskId, found.id);
        await m.tx.update(comments).set({ deletedAt: m.now }).where(eq(comments.id, comment.id));
        m.emit('comment.deleted', comment.taskId, { commentId: comment.id });
      });
      return reply.code(204).send(null);
    },
  );

  done();
};
