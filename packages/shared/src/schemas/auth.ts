import { z } from 'zod';
import {
  accentSchema,
  densitySchema,
  localeSchema,
  notificationPrefsSchema,
  paletteKeySchema,
  themeSchema,
  workspaceRoleSchema,
} from '../enums.js';

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** New passwords (invite accept). Login accepts any non-empty string so old rules never lock anyone out. */
export const passwordSchema = z.string().min(8).max(200);

export const nameSchema = z.string().trim().min(1).max(80);

/** IANA zone name the runtime knows, e.g. `Asia/Ulaanbaatar`. */
export const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  initials: z.string(),
  avatarColor: paletteKeySchema,
});

export const preferencesSchema = z.object({
  locale: localeSchema,
  timezone: z.string(),
  theme: themeSchema,
  accent: accentSchema,
  density: densitySchema,
  notificationPrefs: notificationPrefsSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const meWorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
  title: z.string().nullable(),
});

/** `GET /auth/me`, and the body of a successful login / invite accept / `PATCH /me`. */
export const meResponseSchema = z
  .object({
    user: meUserSchema,
    preferences: preferencesSchema,
    workspaces: z.array(meWorkspaceSchema),
  })
  .meta({ id: 'Me' });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeSchema = z
  .object({
    name: nameSchema,
    locale: localeSchema,
    timezone: timezoneSchema,
    theme: themeSchema,
    accent: accentSchema,
    density: densitySchema,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')
  .meta({ id: 'UpdateMe' });
export type UpdateMe = z.infer<typeof updateMeSchema>;

/** Owners are made at workspace creation, never invited. */
export const inviteRoleSchema = z.enum(['admin', 'member']);

export const createInviteSchema = z
  .object({
    email: emailSchema,
    role: inviteRoleSchema.default('member'),
  })
  .meta({ id: 'CreateInvite' });
export type CreateInvite = z.infer<typeof createInviteSchema>;

export const inviteSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    role: inviteRoleSchema,
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'Invite' });
export type Invite = z.infer<typeof inviteSchema>;

/** `GET /invites/:token` — what the accept page shows before the user commits. */
export const invitePreviewSchema = z
  .object({
    workspace: z.object({ name: z.string() }),
    email: z.string(),
    role: inviteRoleSchema,
    expiresAt: z.iso.datetime(),
    /** True when the email already has an account: accept by signing in instead of creating one. */
    accountExists: z.boolean(),
  })
  .meta({ id: 'InvitePreview' });
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** Name + password are required for a new account and ignored for an existing one. */
export const acceptInviteSchema = z
  .object({
    name: nameSchema.optional(),
    password: passwordSchema.optional(),
  })
  .meta({ id: 'AcceptInvite' });
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;
