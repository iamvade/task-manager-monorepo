import { z } from 'zod';
import { paletteKeySchema, workspaceRoleSchema } from '../enums.js';
import { userRefSchema } from './common.js';

/** A workspace member with their role and job title (pickers, member lists, settings). */
export const workspaceMemberSchema = z.object({
  user: userRefSchema.extend({ email: z.string() }),
  role: workspaceRoleSchema,
  /** Job title shown as a role hint, e.g. "Eng lead". */
  title: z.string().nullable(),
  joinedAt: z.iso.datetime(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const sidebarProjectSchema = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  name: z.string(),
  key: z.string(),
  color: paletteKeySchema,
  position: z.string(),
  createdAt: z.iso.datetime(),
});
export type SidebarProject = z.infer<typeof sidebarProjectSchema>;

export const sidebarSpaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  initial: z.string(),
  color: paletteKeySchema,
  position: z.string(),
  /** Non-archived projects, by position. */
  projects: z.array(sidebarProjectSchema),
});
export type SidebarSpace = z.infer<typeof sidebarSpaceSchema>;

/** `GET /workspaces/:id/sidebar` — everything the sidebar needs in one request. */
export const sidebarResponseSchema = z.object({
  spaces: z.array(sidebarSpaceSchema),
  /** The caller's favorite (non-archived) projects, by name. */
  favorites: z.array(sidebarProjectSchema),
  /** Open (not done, not deleted) tasks assigned to the caller. */
  myTasksCount: z.number().int(),
  /** Unread, unarchived notifications. */
  inboxUnreadCount: z.number().int(),
});
export type SidebarResponse = z.infer<typeof sidebarResponseSchema>;

export const projectKeySuggestionQuerySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export const projectKeySuggestionSchema = z.object({ key: z.string() });
export type ProjectKeySuggestion = z.infer<typeof projectKeySuggestionSchema>;
