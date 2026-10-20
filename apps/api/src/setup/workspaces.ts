import {
  emailSchema,
  initialsFor,
  localeSchema,
  nameSchema,
  passwordSchema,
  timezoneSchema,
  type PlatformRole,
} from '@kite/shared';
import { z } from 'zod';
import { avatarColorFor } from '../auth/avatar.js';
import { hashPassword } from '../auth/password.js';
import type { DbOrTx } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../db/holidays.js';
import { one } from '../db/rows.js';
import { users, workspaceHolidays, workspaces } from '../db/schema/index.js';

export const newAccountSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  locale: localeSchema.default('mn'),
  timezone: timezoneSchema.default('Asia/Ulaanbaatar'),
});
export type NewAccountInput = z.input<typeof newAccountSchema>;

export class SetupError extends Error {
  readonly code: 'EMAIL_TAKEN' | 'SLUG_TAKEN';

  constructor(code: SetupError['code'], message: string) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
  }
}

/** Inserts an account (`platformRole` set only for the platform admin). */
export async function createAccount(
  db: DbOrTx,
  rawInput: NewAccountInput,
  platformRole: PlatformRole | null = null,
) {
  const input = newAccountSchema.parse(rawInput);
  const passwordHash = await hashPassword(input.password);
  try {
    return one(
      await db
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          initials: initialsFor(input.name),
          avatarColor: avatarColorFor(input.email),
          passwordHash,
          locale: input.locale,
          timezone: input.timezone,
          platformRole,
        })
        .returning({ id: users.id, email: users.email, name: users.name }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new SetupError('EMAIL_TAKEN', `An account with ${input.email} already exists.`);
    }
    throw err;
  }
}

/** Inserts a workspace (no members) and its public holidays. */
export async function createWorkspace(db: DbOrTx, input: { name: string; slug: string }) {
  let workspace;
  try {
    workspace = one(
      await db.insert(workspaces).values({ name: input.name, slug: input.slug }).returning(),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new SetupError('SLUG_TAKEN', `The address "${input.slug}" is already used.`);
    }
    throw err;
  }
  await db
    .insert(workspaceHolidays)
    .values(MN_PUBLIC_HOLIDAYS_2026.map((h) => ({ workspaceId: workspace.id, ...h })));
  return workspace;
}
