import { z } from 'zod';
import { paletteKeySchema, workspaceRoleSchema } from '../enums.js';
import { absenceRefSchema } from './absence.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch, userRefSchema } from './common.js';

/** A workspace member with their role and job title (pickers, member lists, settings). */
export const workspaceMemberSchema = z
  .object({
    user: userRefSchema.extend({ email: z.string() }),
    role: workspaceRoleSchema,
    /** Job title shown as a role hint, e.g. "Eng lead". */
    title: z.string().nullable(),
    /** Points this person can take on over the next 2 weeks (Workload capacity marker). */
    capacityPoints: z.number().int(),
    joinedAt: z.iso.datetime(),
    /** Current and upcoming out-of-office periods, by start date; see `isAway` / `currentAbsence`. */
    absences: z.array(absenceRefSchema),
    /** Set on deactivated members (Settings → Members with `include=deactivated` only). */
    deactivatedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'WorkspaceMember' });
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const MAX_CAPACITY_POINTS = 100;

/**
 * `PATCH /workspaces/:id/members/:userId` (admins). Owners are made at workspace creation only, so
 * `role` is admin or member; a blank `title` clears it.
 */
export const updateMemberSchema = z
  .object({
    role: z.enum(['admin', 'member']),
    title: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .transform((t) => (t === '' ? null : t)),
    capacityPoints: z.number().int().min(0).max(MAX_CAPACITY_POINTS),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateMember' });
export type UpdateMember = z.input<typeof updateMemberSchema>;

/** `POST /workspaces/:id/members/:userId/deactivate`: who takes over their open work, if anyone. */
export const deactivateMemberSchema = z
  .object({ reassignTo: z.uuid().nullable().optional() })
  .meta({ id: 'DeactivateMember' });
export type DeactivateMember = z.infer<typeof deactivateMemberSchema>;

/** What a deactivation hands over (the dialog shows it first). */
export const memberHandoverSchema = z
  .object({
    /** Open tasks assigned to them. */
    openTasks: z.number().int(),
    /** Open tasks where they are the reviewer. */
    reviewing: z.number().int(),
    /** Non-archived projects they lead. */
    leadOf: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string() })),
  })
  .meta({ id: 'MemberHandover' });
export type MemberHandover = z.infer<typeof memberHandoverSchema>;

export const memberListQuerySchema = z.object({
  /** `deactivated` adds deactivated members (admins; Settings → Members). */
  include: z.enum(['deactivated']).optional(),
});

export const sidebarProjectSchema = z
  .object({
    id: z.uuid(),
    spaceId: z.uuid(),
    name: z.string(),
    key: z.string(),
    color: paletteKeySchema,
    position: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'SidebarProject' });
export type SidebarProject = z.infer<typeof sidebarProjectSchema>;

export const sidebarSpaceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    initial: z.string(),
    color: paletteKeySchema,
    position: z.string(),
    /** Who created it (may delete it while empty, like an admin); null before migration 0007. */
    createdById: z.uuid().nullable(),
    /** Non-archived projects, by position. */
    projects: z.array(sidebarProjectSchema),
  })
  .meta({ id: 'SidebarSpace' });
export type SidebarSpace = z.infer<typeof sidebarSpaceSchema>;

/** `GET /workspaces/:id/sidebar` — everything the sidebar needs in one request. */
export const sidebarResponseSchema = z
  .object({
    spaces: z.array(sidebarSpaceSchema),
    /** The caller's favorite (non-archived) projects, by name. */
    favorites: z.array(sidebarProjectSchema),
    /** Open (not done, not deleted) tasks assigned to the caller. */
    myTasksCount: z.number().int(),
    /** Unread, unarchived notifications. */
    inboxUnreadCount: z.number().int(),
    /** Feedback with status New that nobody has opened yet. */
    feedbackUnreadCount: z.number().int(),
  })
  .meta({ id: 'Sidebar' });
export type SidebarResponse = z.infer<typeof sidebarResponseSchema>;

export const projectKeySuggestionQuerySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export const projectKeySuggestionSchema = z
  .object({ key: z.string() })
  .meta({ id: 'ProjectKeySuggestion' });
export type ProjectKeySuggestion = z.infer<typeof projectKeySuggestionSchema>;
