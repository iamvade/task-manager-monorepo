import { z } from 'zod';
import { notificationTypeSchema } from '../enums.js';
import { userRefSchema } from './common.js';
import { historyEntrySchema } from './feed.js';
import { taskProjectRefSchema } from './task.js';

/** Inbox tabs: All / Mentions / Assigned to me (all unarchived) and Archived. */
export const INBOX_TABS = ['all', 'mentions', 'assigned', 'archived'] as const;
export const inboxTabSchema = z.enum(INBOX_TABS);
export type InboxTab = z.infer<typeof inboxTabSchema>;

/** Opaque keyset cursor of a newest-first page. */
export const cursorSchema = z.string().min(1).max(200);

export const notificationListQuerySchema = z.object({
  workspaceId: z.uuid(),
  tab: inboxTabSchema.default('all'),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type NotificationListQuery = z.input<typeof notificationListQuerySchema>;

/** The task a notification or feed line is about. */
export const taskRefSchema = z
  .object({
    id: z.uuid(),
    /** `APP-142`. */
    key: z.string(),
    number: z.number().int(),
    title: z.string(),
  })
  .meta({ id: 'TaskRef' });
export type TaskRef = z.infer<typeof taskRefSchema>;

export const notificationSchema = z
  .object({
    id: z.uuid(),
    type: notificationTypeSchema,
    task: taskRefSchema,
    project: taskProjectRefSchema,
    /** Who acted last (duplicates within 5 minutes collapse into the latest). */
    actor: userRefSchema,
    /** The activity line behind it ("moved … to In Review"); null when it can't be shown. */
    activity: historyEntrySchema.nullable(),
    /** Comment text (mentions, comments) or description text (description mentions), truncated. */
    snippet: z.string().nullable(),
    readAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof notificationSchema>;

export const notificationPageSchema = z
  .object({
    /** Newest first. */
    items: z.array(notificationSchema),
    nextCursor: cursorSchema.nullable(),
    counts: z.object({
      /** Unread, unarchived (the sidebar badge). */
      unread: z.number().int(),
      archived: z.number().int(),
    }),
  })
  .meta({ id: 'NotificationPage' });
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const readAllNotificationsSchema = z
  .object({ workspaceId: z.uuid() })
  .meta({ id: 'ReadAllNotifications' });
export type ReadAllNotifications = z.infer<typeof readAllNotificationsSchema>;

export const readAllResultSchema = z
  .object({ updated: z.number().int() })
  .meta({ id: 'ReadAllResult' });
