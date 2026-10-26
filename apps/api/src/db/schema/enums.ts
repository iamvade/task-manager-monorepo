import {
  DENSITIES,
  FEEDBACK_ACTIVITY_KINDS,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  LOCALES,
  MEETING_TASK_SOURCES,
  NOTIFICATION_LEVELS,
  NOTIFICATION_TYPES,
  PLATFORM_ROLES,
  PRIORITIES,
  SESSION_CLIENTS,
  SIZES,
  SPEAKING_ORDERS,
  STANDUP_ENTRY_STATUSES,
  STANDUP_REACTIONS,
  STATUS_CATEGORIES,
  THEMES,
  WORKSPACE_ROLES,
} from '@kite/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', LOCALES);
export const themeEnum = pgEnum('theme', THEMES);
export const densityEnum = pgEnum('density', DENSITIES);
export const workspaceRoleEnum = pgEnum('workspace_role', WORKSPACE_ROLES);
export const platformRoleEnum = pgEnum('platform_role', PLATFORM_ROLES);
export const sessionClientEnum = pgEnum('session_client', SESSION_CLIENTS);
export const priorityEnum = pgEnum('priority', PRIORITIES);
export const taskSizeEnum = pgEnum('task_size', SIZES);
export const statusCategoryEnum = pgEnum('status_category', STATUS_CATEGORIES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const notificationLevelEnum = pgEnum('notification_level', NOTIFICATION_LEVELS);
export const speakingOrderEnum = pgEnum('speaking_order', SPEAKING_ORDERS);
export const standupEntryStatusEnum = pgEnum('standup_entry_status', STANDUP_ENTRY_STATUSES);
export const standupReactionEnum = pgEnum('standup_reaction', STANDUP_REACTIONS);
export const meetingTaskSourceEnum = pgEnum('meeting_task_source', MEETING_TASK_SOURCES);
export const feedbackTypeEnum = pgEnum('feedback_type', FEEDBACK_TYPES);
export const feedbackStatusEnum = pgEnum('feedback_status', FEEDBACK_STATUSES);
export const feedbackActivityKindEnum = pgEnum('feedback_activity_kind', FEEDBACK_ACTIVITY_KINDS);
