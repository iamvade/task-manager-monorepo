import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';
import { transliterate } from '../project-key.js';
import { emailSchema, nameSchema } from './auth.js';

/** Workspace slugs name the public feedback form (`/feedback/:slug`): lowercase words joined by `-`. */
export const workspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes');

/** Suggested slug from a workspace name (Cyrillic transliterated); `workspace` when nothing is left. */
export function workspaceSlug(name: string): string {
  const slug = transliterate(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : 'workspace';
}

/** A pending owner invite, without its link (only the create/re-issue responses carry that). */
export const ownerInviteSchema = z.object({
  email: z.string(),
  expiresAt: z.iso.datetime(),
});

/** One row of the `/admin` console. */
export const adminWorkspaceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    createdAt: z.iso.datetime(),
    /** Active members. */
    memberCount: z.number().int(),
    owner: z.object({ name: z.string(), email: z.string() }).nullable(),
    /** Set while there is no owner and an owner invite is pending. */
    ownerInvite: ownerInviteSchema.nullable(),
  })
  .meta({ id: 'AdminWorkspace' });
export type AdminWorkspace = z.infer<typeof adminWorkspaceSchema>;

export const createWorkspaceSchema = z
  .object({
    name: nameSchema,
    slug: workspaceSlugSchema,
    ownerEmail: emailSchema,
  })
  .meta({ id: 'CreateWorkspace' });
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;

export const ownerInviteRequestSchema = z
  .object({ email: emailSchema })
  .meta({ id: 'OwnerInviteRequest' });
export type OwnerInviteRequest = z.infer<typeof ownerInviteRequestSchema>;

/** The owner invite with its accept link: returned once, when created. */
export const createdOwnerInviteSchema = ownerInviteSchema
  .extend({ link: z.url() })
  .meta({ id: 'CreatedOwnerInvite' });
export type CreatedOwnerInvite = z.infer<typeof createdOwnerInviteSchema>;

export const createdWorkspaceSchema = z
  .object({
    workspace: adminWorkspaceSchema,
    invite: createdOwnerInviteSchema,
  })
  .meta({ id: 'CreatedWorkspace' });
export type CreatedWorkspace = z.infer<typeof createdWorkspaceSchema>;

/** One person in the console's Users search (never a platform admin). */
export const adminUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    initials: z.string(),
    avatarColor: paletteKeySchema,
    /** Workspaces where they are an active member, by name. */
    workspaces: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** Set while an unused, unexpired reset link exists. */
    pendingReset: z.object({ expiresAt: z.iso.datetime() }).nullable(),
  })
  .meta({ id: 'AdminUser' });
export type AdminUser = z.infer<typeof adminUserSchema>;

/** A password reset link: returned once, when created. */
export const createdPasswordResetSchema = z
  .object({
    email: z.string(),
    expiresAt: z.iso.datetime(),
    link: z.url(),
  })
  .meta({ id: 'AdminPasswordReset' });
export type CreatedPasswordReset = z.infer<typeof createdPasswordResetSchema>;
