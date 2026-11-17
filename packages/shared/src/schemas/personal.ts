import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { paletteKeySchema } from '../enums.js';
import { personalDocSchema } from '../personal.js';
import { richTextNodeSchema } from '../rich-text.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch } from './common.js';

/**
 * Personal space: one person's private topics, notes and to-dos (the same in every workspace).
 * Nobody else, admins and the platform admin included, can read or change them.
 */

export const PERSONAL_ITEM_KINDS = ['note', 'todo'] as const;
export const personalItemKindSchema = z.enum(PERSONAL_ITEM_KINDS);
export type PersonalItemKind = z.infer<typeof personalItemKindSchema>;

export const personalTopicNameSchema = z.string().trim().min(1).max(60);
export const personalTitleSchema = z.string().trim().min(1).max(200);

export const personalTopicSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: paletteKeySchema,
    position: z.string(),
  })
  .meta({ id: 'PersonalTopic' });
export type PersonalTopic = z.infer<typeof personalTopicSchema>;

export const createPersonalTopicSchema = z
  .object({ name: personalTopicNameSchema, color: paletteKeySchema })
  .meta({ id: 'CreatePersonalTopic' });
export type CreatePersonalTopic = z.infer<typeof createPersonalTopicSchema>;

export const updatePersonalTopicSchema = z
  .object({ name: personalTopicNameSchema, color: paletteKeySchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdatePersonalTopic' });
export type UpdatePersonalTopic = z.infer<typeof updatePersonalTopicSchema>;

/** A note or to-do without its body: lists, the `[[` popup, the graph. */
export const personalItemSummarySchema = z
  .object({
    id: z.uuid(),
    kind: personalItemKindSchema,
    title: z.string(),
    topicId: z.uuid().nullable(),
    dueDate: dateSchema.nullable(),
    doneAt: z.iso.datetime().nullable(),
    position: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'PersonalItemSummary' });
export type PersonalItemSummary = z.infer<typeof personalItemSummarySchema>;

/**
 * One `[[link]]` written in a note's body. `targetItemId` set: a picked note (it may since have
 * been deleted). `targetTaskId` set: a team task. Neither: a note that doesn't exist yet, by
 * `title`. `title` is the title stored in the link (the task's key for tasks).
 */
export const personalLinkSchema = z
  .object({
    sourceId: z.uuid(),
    targetItemId: z.uuid().nullable(),
    targetTaskId: z.uuid().nullable(),
    title: z.string(),
  })
  .meta({ id: 'PersonalLink' });
export type PersonalLink = z.infer<typeof personalLinkSchema>;

/**
 * A team task some note links to, as I can see it now. Tasks I can't see (deleted, or in a
 * workspace I'm not an active member of) are left out: they show as "Unavailable".
 */
export const personalTaskRefSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    title: z.string(),
    closed: z.boolean(),
    workspaceId: z.uuid(),
    workspaceSlug: z.string(),
  })
  .meta({ id: 'PersonalTaskRef' });
export type PersonalTaskRef = z.infer<typeof personalTaskRefSchema>;

/** `GET /me/personal`: everything but the bodies. */
export const personalIndexSchema = z
  .object({
    topics: z.array(personalTopicSchema),
    items: z.array(personalItemSummarySchema),
    links: z.array(personalLinkSchema),
    tasks: z.array(personalTaskRefSchema),
  })
  .meta({ id: 'PersonalIndex' });
export type PersonalIndex = z.infer<typeof personalIndexSchema>;

export const personalBacklinkSchema = z
  .object({ id: z.uuid(), kind: personalItemKindSchema, title: z.string() })
  .meta({ id: 'PersonalBacklink' });
export type PersonalBacklink = z.infer<typeof personalBacklinkSchema>;

export const personalItemSchema = personalItemSummarySchema
  .extend({
    body: richTextNodeSchema.nullable(),
    /** Notes whose links lead here, by title. */
    backlinks: z.array(personalBacklinkSchema),
  })
  .meta({ id: 'PersonalItem' });
export type PersonalItem = z.infer<typeof personalItemSchema>;

export const createPersonalItemSchema = z
  .object({
    kind: personalItemKindSchema.default('note'),
    title: personalTitleSchema,
    topicId: z.uuid().nullable().default(null),
    body: personalDocSchema.nullable().default(null),
    dueDate: dateSchema.nullable().default(null),
  })
  .meta({ id: 'CreatePersonalItem' });
export type CreatePersonalItem = z.input<typeof createPersonalItemSchema>;

export const updatePersonalItemSchema = z
  .object({
    kind: personalItemKindSchema,
    title: personalTitleSchema,
    topicId: z.uuid().nullable(),
    body: personalDocSchema.nullable(),
    dueDate: dateSchema.nullable(),
    done: z.boolean(),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdatePersonalItem' });
export type UpdatePersonalItem = z.infer<typeof updatePersonalItemSchema>;
