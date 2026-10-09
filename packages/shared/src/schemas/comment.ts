import { z } from 'zod';
import { richTextDocSchema, richTextNodeSchema } from '../rich-text.js';
import { userRefSchema } from './common.js';

const commentFields = {
  id: z.uuid(),
  taskId: z.uuid(),
  /** Set on replies (always a top-level comment: threads are one level deep). */
  parentId: z.uuid().nullable(),
  author: userRefSchema,
  /** TipTap document; null when the comment was deleted but its replies are still shown. */
  body: richTextNodeSchema.nullable(),
  /** Plain text of `body` (mentions as `@Name`); empty when deleted. */
  bodyText: z.string(),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  deletedAt: z.iso.datetime().nullable(),
};

export const commentReplySchema = z.object(commentFields).meta({ id: 'CommentReply' });
export type CommentReply = z.infer<typeof commentReplySchema>;

/** A top-level comment with its replies (oldest first). */
export const commentSchema = z
  .object({ ...commentFields, replies: z.array(commentReplySchema) })
  .meta({ id: 'Comment' });
export type Comment = z.infer<typeof commentSchema>;

export const createCommentSchema = z
  .object({
    body: richTextDocSchema,
    /** Reply to this comment; a reply to a reply joins the thread of its top-level comment. */
    parentId: z.uuid().optional(),
  })
  .meta({ id: 'CreateComment' });
export type CreateComment = z.input<typeof createCommentSchema>;

export const updateCommentSchema = z
  .object({ body: richTextDocSchema })
  .strict()
  .meta({ id: 'UpdateComment' });
export type UpdateComment = z.input<typeof updateCommentSchema>;
