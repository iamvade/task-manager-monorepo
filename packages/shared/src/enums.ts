import { z } from 'zod';

// Value tuples are the single source for both the zod schemas below and the Postgres enums in apps/api.

export const LOCALES = ['mn', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

export const STATUS_CATEGORIES = ['todo', 'in_progress', 'review', 'done'] as const;
export const statusCategorySchema = z.enum(STATUS_CATEGORIES);
export type StatusCategory = z.infer<typeof statusCategorySchema>;

export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const NOTIFICATION_TYPES = ['mention', 'assigned', 'comment', 'status'] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationPrefsSchema = z.object({
  mention: z.boolean(),
  assigned: z.boolean(),
  comment: z.boolean(),
  status: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const THEMES = ['light', 'dark', 'system'] as const;
export const themeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof themeSchema>;

export const DENSITIES = ['comfortable', 'compact'] as const;
export const densitySchema = z.enum(DENSITIES);
export type Density = z.infer<typeof densitySchema>;

/** Color keys stored in avatar/space/project/tag `color` columns; the web app maps each to light/dark values. */
export const PALETTE_KEYS = [
  'indigo',
  'green',
  'rose',
  'amber',
  'sky',
  'purple',
  'teal',
  'yellow',
  'violet',
  'blue',
  'orange',
  'pink',
  'neutral',
] as const;
export const paletteKeySchema = z.enum(PALETTE_KEYS);
export type PaletteKey = z.infer<typeof paletteKeySchema>;

export const ACTIVITY_TYPES = [
  'task.created',
  'title.changed',
  'description.changed',
  'status.changed',
  'priority.changed',
  'assignee.added',
  'assignee.removed',
  'due.changed',
  'start.changed',
  'tag.added',
  'tag.removed',
  'project.changed',
  'sprint.changed',
  'attachment.added',
  'attachment.removed',
  'subtask.added',
  'subtask.completed',
  'comment.added',
  'task.deleted',
  'task.restored',
] as const;
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof activityTypeSchema>;
