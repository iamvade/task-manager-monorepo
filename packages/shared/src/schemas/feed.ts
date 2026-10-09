import { z } from 'zod';
import { activityPayloadSchemas, type ActivityPayload, type TaskActivityType } from './activity.js';
import { commentSchema } from './comment.js';
import { userRefSchema, type UserRef } from './common.js';

export const FEED_TYPES = ['all', 'comments', 'history'] as const;
export const feedTypeSchema = z.enum(FEED_TYPES);
export type FeedType = z.infer<typeof feedTypeSchema>;

/** `GET /tasks/:id/activity`: the drawer's All / Comments / History tabs. */
export const feedQuerySchema = z.object({ type: feedTypeSchema.default('all') });

/** One history line ("Dorj E. changed status from To Do to In Progress"). */
export type HistoryEntry = {
  [T in TaskActivityType]: {
    kind: 'history';
    id: string;
    type: T;
    payload: ActivityPayload<T>;
    actor: UserRef;
    createdAt: string;
  };
}[TaskActivityType];

const historyVariants = (Object.keys(activityPayloadSchemas) as TaskActivityType[]).map((type) =>
  z.object({
    kind: z.literal('history'),
    id: z.uuid(),
    type: z.literal(type),
    payload: activityPayloadSchemas[type],
    actor: userRefSchema,
    createdAt: z.iso.datetime(),
  }),
);

// Built from the payload table so each `type` carries its own payload shape; the static type is
// spelled out above because inference can't correlate `type` and `payload` across the map.
export const historyEntrySchema = z
  .discriminatedUnion(
    'type',
    historyVariants as [(typeof historyVariants)[number], ...typeof historyVariants],
  )
  .meta({ id: 'HistoryEntry' }) as unknown as z.ZodType<HistoryEntry>;

/** A top-level comment (with replies) in the feed. */
export const commentFeedItemSchema = commentSchema
  .extend({ kind: z.literal('comment') })
  .meta({ id: 'CommentFeedItem' });
export type CommentFeedItem = z.infer<typeof commentFeedItemSchema>;

export const feedItemSchema = z
  .union([historyEntrySchema, commentFeedItemSchema])
  .meta({ id: 'FeedItem' });
export type FeedItem = HistoryEntry | CommentFeedItem;

export const taskFollowersSchema = z
  .object({
    /** Whether the caller follows the task. */
    following: z.boolean(),
    /** By name. */
    followers: z.array(userRefSchema),
  })
  .meta({ id: 'TaskFollowers' });
export type TaskFollowers = z.infer<typeof taskFollowersSchema>;
