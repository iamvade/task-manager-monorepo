import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { notificationTypeSchema, paletteKeySchema, prioritySchema } from '../enums.js';
import { historyEntrySchema } from './feed.js';
import { cursorSchema, taskRefSchema } from './notification.js';
import { taskProjectRefSchema, taskStatusRefSchema } from './task.js';

export const homeQuerySchema = z.object({ workspaceId: z.uuid() });

export const activityPageQuerySchema = z.object({
  workspaceId: z.uuid(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** A row in a My Tasks section. */
export const myTaskSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    title: z.string(),
    priority: prioritySchema,
    dueDate: dateSchema.nullable(),
    done: z.boolean(),
    completedAt: z.iso.datetime().nullable(),
    status: taskStatusRefSchema,
    project: taskProjectRefSchema,
    space: z.object({ id: z.uuid(), initial: z.string(), color: paletteKeySchema }),
  })
  .meta({ id: 'MyTask' });
export type MyTask = z.infer<typeof myTaskSchema>;

/** One line of "Recent activity" on My Tasks. */
export const activityFeedItemSchema = z
  .object({
    activity: historyEntrySchema,
    task: taskRefSchema,
    project: taskProjectRefSchema,
    /** Set when the line notified me (`mention` → "mentioned you in"). */
    notificationType: notificationTypeSchema.nullable(),
    snippet: z.string().nullable(),
    /** My notification for this activity is unread. */
    unread: z.boolean(),
  })
  .meta({ id: 'ActivityFeedItem' });
export type ActivityFeedItem = z.infer<typeof activityFeedItemSchema>;

export const activityPageSchema = z
  .object({
    /** Newest first. */
    items: z.array(activityFeedItemSchema),
    nextCursor: cursorSchema.nullable(),
  })
  .meta({ id: 'ActivityPage' });
export type ActivityPage = z.infer<typeof activityPageSchema>;

/** `GET /me/home` — the My Tasks page. Days are in the caller's time zone. */
export const homeSchema = z
  .object({
    today: dateSchema,
    timezone: z.string(),
    /** Monday of the current week. */
    weekStart: dateSchema,
    sections: z.object({
      /** Open, due before today; oldest first. */
      overdue: z.array(myTaskSchema),
      /** Due today, done ones included. */
      today: z.array(myTaskSchema),
      /** Open, due tomorrow through Sunday. */
      thisWeek: z.array(myTaskSchema),
      /** Open, due after Sunday, then those without a due date. */
      later: z.array(myTaskSchema),
    }),
    stats: z.object({
      dueToday: z.object({
        open: z.number().int(),
        total: z.number().int(),
        /** Open urgent ones. */
        urgent: z.number().int(),
      }),
      completedThisWeek: z.object({
        count: z.number().int(),
        /** Mon→today minus the same span last week. */
        delta: z.number().int(),
        /** Mon–Sun. */
        perDay: z.array(z.number().int()).length(7),
      }),
      overdue: z.object({
        count: z.number().int(),
        /** Days the oldest overdue task is late; null with none. */
        oldestDaysLate: z.number().int().nullable(),
      }),
    }),
    activity: activityPageSchema,
  })
  .meta({ id: 'Home' });
export type Home = z.infer<typeof homeSchema>;
