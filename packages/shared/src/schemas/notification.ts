import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { notificationLevelSchema, notificationTypeSchema } from '../enums.js';
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
  /** Only notifications about this project's tasks (the counts stay workspace-wide). */
  projectId: z.uuid().optional(),
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

/** The standup a `standup_*` notification (or a mention in a standup reply) is about. */
export const notificationStandupRefSchema = z
  .object({
    groupId: z.uuid(),
    groupName: z.string(),
    /** The standup day (opens `/standup/:groupId?date=`). */
    date: dateSchema,
    entryId: z.uuid().nullable(),
    blockerId: z.uuid().nullable(),
    /** Whose update it is about (replies, help, resolved). */
    entryAuthor: userRefSchema.nullable(),
  })
  .meta({ id: 'NotificationStandupRef' });
export type NotificationStandupRef = z.infer<typeof notificationStandupRefSchema>;

/** What the facilitator's digest shows, as it was when it was sent. */
export const standupDigestDataSchema = z
  .object({
    posted: z.array(userRefSchema),
    notPosted: z.array(userRefSchema),
    out: z.array(userRefSchema),
    openBlockers: z.number().int(),
  })
  .meta({ id: 'StandupDigestData' });
export type StandupDigestData = z.infer<typeof standupDigestDataSchema>;

export const notificationSchema = z
  .object({
    id: z.uuid(),
    type: notificationTypeSchema,
    /** Null for standup notifications (then `standup` is set). */
    task: taskRefSchema.nullable(),
    project: taskProjectRefSchema.nullable(),
    standup: notificationStandupRefSchema.nullable(),
    /** Who acted last (duplicates within 5 minutes collapse into the latest); null for reminders and digests. */
    actor: userRefSchema.nullable(),
    /** The activity line behind it ("moved … to In Review"); null when it can't be shown. */
    activity: historyEntrySchema.nullable(),
    /**
     * Comment text (mentions, comments), description text (description mentions), the reply
     * (standup replies and mentions in them) or the blocker (help, resolved), truncated.
     */
    snippet: z.string().nullable(),
    /** The digest's contents (`standup_digest` only). */
    digest: standupDigestDataSchema.nullable(),
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

/** Unread inbox items per workspace I'm an active member of (the workspace switcher's dots). */
export const unreadCountsSchema = z
  .array(z.object({ workspaceId: z.uuid(), unread: z.number().int() }))
  .meta({ id: 'UnreadCounts' });
export type UnreadCounts = z.infer<typeof unreadCountsSchema>;

export const readAllNotificationsSchema = z
  .object({ workspaceId: z.uuid() })
  .meta({ id: 'ReadAllNotifications' });
export type ReadAllNotifications = z.infer<typeof readAllNotificationsSchema>;

export const readAllResultSchema = z
  .object({ updated: z.number().int() })
  .meta({ id: 'ReadAllResult' });

/** A project where the caller changed the notification level (others are `all`). */
export const projectNotificationLevelSchema = z
  .object({ projectId: z.uuid(), level: notificationLevelSchema })
  .meta({ id: 'ProjectNotificationLevel' });
export type ProjectNotificationLevel = z.infer<typeof projectNotificationLevelSchema>;

export const setNotificationLevelSchema = z
  .object({ level: notificationLevelSchema })
  .meta({ id: 'SetNotificationLevel' });
export type SetNotificationLevel = z.infer<typeof setNotificationLevelSchema>;
