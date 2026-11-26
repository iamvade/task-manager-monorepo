import type { StatusCategory } from '@kite/shared';

/** Which tasks the views show (`?show=`): Active (the default), Backlog or All. */
export const SHOWS = ['active', 'backlog', 'all'] as const;
export type Show = (typeof SHOWS)[number];

/** "Active" (the default): To Do, In Progress and In Review only. */
export const ACTIVE_CATEGORIES = ['todo', 'in_progress', 'review'] as const;

/** The categories each show keeps; null = every category (All). */
export const SHOW_CATEGORIES: Readonly<Record<Show, readonly StatusCategory[] | null>> = {
  active: ACTIVE_CATEGORIES,
  backlog: ['backlog'],
  all: null,
};
