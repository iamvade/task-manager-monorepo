import {
  DENSITIES,
  LOCALES,
  NOTIFICATION_TYPES,
  PRIORITIES,
  STATUS_CATEGORIES,
  THEMES,
  WORKSPACE_ROLES,
} from '@kite/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', LOCALES);
export const themeEnum = pgEnum('theme', THEMES);
export const densityEnum = pgEnum('density', DENSITIES);
export const workspaceRoleEnum = pgEnum('workspace_role', WORKSPACE_ROLES);
export const priorityEnum = pgEnum('priority', PRIORITIES);
export const statusCategoryEnum = pgEnum('status_category', STATUS_CATEGORIES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
