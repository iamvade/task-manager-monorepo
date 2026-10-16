import { z } from 'zod';

// Value tuples are the single source for both the zod schemas below and the Postgres enums in apps/api.

export const LOCALES = ['mn', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

/** Task size (story points via SIZE_POINTS); null = unsized. */
export const SIZES = ['S', 'M', 'L', 'XL'] as const;
export const sizeSchema = z.enum(SIZES);
export type Size = z.infer<typeof sizeSchema>;

/** Points per size, used by Workload, Throughput and Completed points. Unsized tasks count 0. */
export const SIZE_POINTS: Readonly<Record<Size, number>> = { S: 1, M: 3, L: 5, XL: 8 };

export const STATUS_CATEGORIES = ['todo', 'in_progress', 'review', 'done'] as const;
export const statusCategorySchema = z.enum(STATUS_CATEGORIES);
export type StatusCategory = z.infer<typeof statusCategorySchema>;

export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/**
 * Notification types, highest priority first (one notification per recipient per event: the
 * highest type they have enabled). The `standup_*` types are about a standup group, not a task:
 * a helper named on a blocker, a reply on my update, my blocker resolved, the daily reminder and
 * the facilitator's digest.
 */
export const NOTIFICATION_TYPES = [
  'mention',
  'assigned',
  'comment',
  'status',
  'standup_help',
  'standup_reply',
  'standup_resolved',
  'standup_reminder',
  'standup_digest',
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * How much of a project reaches someone's Inbox: everything they'd normally get, only @mentions
 * and new assignments ("direct"), or nothing. No setting = `all`.
 */
export const NOTIFICATION_LEVELS = ['all', 'direct', 'none'] as const;
export const notificationLevelSchema = z.enum(NOTIFICATION_LEVELS);
export type NotificationLevel = z.infer<typeof notificationLevelSchema>;

/** The Settings → Notifications switches; every `standup_*` type follows `standups`. */
export const NOTIFICATION_PREF_KEYS = [
  'mention',
  'assigned',
  'comment',
  'status',
  'standups',
] as const;
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export const notificationPrefsSchema = z.object({
  mention: z.boolean(),
  assigned: z.boolean(),
  comment: z.boolean(),
  status: z.boolean(),
  standups: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** The switch that turns a notification type on or off. */
export const prefKeyOf = (type: NotificationType): NotificationPrefKey =>
  type.startsWith('standup_') ? 'standups' : (type as NotificationPrefKey);

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
  'size.changed',
  'reviewer.changed',
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

/** Accent colors a user can pick; stored as the hex value in `users.accent`. */
export const ACCENTS = ['#6E56CF', '#2F6FEB', '#0F766E', '#3F3F46'] as const;
export const accentSchema = z.enum(ACCENTS);
export type Accent = z.infer<typeof accentSchema>;

/** Palette keys used for avatars (subset of PALETTE_KEYS). */
export const AVATAR_COLORS = [
  'indigo',
  'green',
  'rose',
  'amber',
  'sky',
  'purple',
  'teal',
  'yellow',
] as const satisfies readonly PaletteKey[];
export const avatarColorSchema = z.enum(AVATAR_COLORS);
export type AvatarColor = z.infer<typeof avatarColorSchema>;

/** Categories of the four statuses every new project starts with, in board order. */
export const DEFAULT_STATUS_CATEGORIES = [
  'todo',
  'in_progress',
  'review',
  'done',
] as const satisfies readonly StatusCategory[];

/** Project templates offered on the empty-project screen. */
export const TEMPLATE_IDS = ['product-launch', 'sprint-planning', 'bug-triage'] as const;
export const templateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof templateIdSchema>;

/** Standup group meeting: who speaks first. */
export const SPEAKING_ORDERS = ['posting_order', 'alphabetical', 'random'] as const;
export const speakingOrderSchema = z.enum(SPEAKING_ORDERS);
export type SpeakingOrder = z.infer<typeof speakingOrderSchema>;

/** Where a task made with "Create task" in a standup meeting came from. */
export const MEETING_TASK_SOURCES = ['today', 'blocker'] as const;
export const meetingTaskSourceSchema = z.enum(MEETING_TASK_SOURCES);
export type MeetingTaskSource = z.infer<typeof meetingTaskSourceSchema>;

export const STANDUP_ENTRY_STATUSES = ['draft', 'posted'] as const;
export const standupEntryStatusSchema = z.enum(STANDUP_ENTRY_STATUSES);
export type StandupEntryStatus = z.infer<typeof standupEntryStatusSchema>;

/** The reactions drawn in Standup.dc.html (thumbs up, eyes "Looking", heart "Love"). */
export const STANDUP_REACTIONS = ['thumbs_up', 'eyes', 'heart'] as const;
export const standupReactionSchema = z.enum(STANDUP_REACTIONS);
export type StandupReaction = z.infer<typeof standupReactionSchema>;

/** Yesterday suggestions, strongest first (a task appears once, with its strongest kind). */
export const STANDUP_SUGGESTION_KINDS = ['completed', 'review', 'commented'] as const;
export const standupSuggestionKindSchema = z.enum(STANDUP_SUGGESTION_KINDS);
export type StandupSuggestionKind = z.infer<typeof standupSuggestionKindSchema>;

/** Today chips, strongest first. */
export const STANDUP_TODAY_TAGS = ['overdue', 'due_today', 'in_progress'] as const;
export const standupTodayTagSchema = z.enum(STANDUP_TODAY_TAGS);
export type StandupTodayTag = z.infer<typeof standupTodayTagSchema>;
