import {
  emailSchema,
  initialsFor,
  localeSchema,
  nameSchema,
  passwordSchema,
  timezoneSchema,
} from '@kite/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { avatarColorFor } from '../auth/avatar.js';
import { hashPassword } from '../auth/password.js';
import type { Db, Tx } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../db/holidays.js';
import { one } from '../db/rows.js';
import { users, workspaceHolidays, workspaceMembers, workspaces } from '../db/schema/index.js';

export const initWorkspaceInputSchema = z.object({
  workspaceName: nameSchema,
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  locale: localeSchema.default('mn'),
  timezone: timezoneSchema.default('Asia/Ulaanbaatar'),
});
export type InitWorkspaceInput = z.input<typeof initWorkspaceInputSchema>;

export class InitError extends Error {
  readonly code: 'ALREADY_INITIALIZED' | 'EMAIL_TAKEN';

  constructor(code: InitError['code'], message: string) {
    super(message);
    this.name = 'InitError';
    this.code = code;
  }
}

/** URL-safe slug from the workspace name; names without Latin letters fall back to `workspace`. */
export function workspaceSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || 'workspace';
}

/** Inserts the owner account, the workspace, the owner membership and the public holidays. */
export async function createOwnerWorkspace(
  tx: Tx,
  input: z.output<typeof initWorkspaceInputSchema>,
) {
  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    user = one(
      await tx
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          initials: initialsFor(input.name),
          avatarColor: avatarColorFor(input.email),
          passwordHash,
          locale: input.locale,
          timezone: input.timezone,
        })
        .returning({ id: users.id, email: users.email }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new InitError('EMAIL_TAKEN', `An account with ${input.email} already exists.`);
    }
    throw err;
  }
  const workspace = one(
    await tx
      .insert(workspaces)
      .values({ name: input.workspaceName, slug: workspaceSlug(input.workspaceName) })
      .returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug }),
  );
  await tx.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: 'owner',
  });
  await tx
    .insert(workspaceHolidays)
    .values(MN_PUBLIC_HOLIDAYS_2026.map((h) => ({ workspaceId: workspace.id, ...h })));
  return { user, workspace };
}

const alreadyInitialized = () =>
  new InitError(
    'ALREADY_INITIALIZED',
    'This database already has a workspace. Invite people from Settings → Members instead.',
  );

/** Throws `ALREADY_INITIALIZED` when any workspace exists (a quick check before prompting). */
export async function assertNotInitialized(db: Db | Tx): Promise<void> {
  const existing = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (existing.length > 0) throw alreadyInitialized();
}

/**
 * First-run setup for a fresh production database: creates the workspace and its owner. Refuses
 * once any workspace exists, so it can't be used to add owners later (invites do that).
 */
export async function initWorkspace(db: Db, rawInput: InitWorkspaceInput) {
  const input = initWorkspaceInputSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    // Two concurrent runs serialize here, so only one can see the empty database.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('kite:init-workspace'))`);
    await assertNotInitialized(tx);
    return createOwnerWorkspace(tx, input);
  });
}
