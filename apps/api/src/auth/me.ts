import { accentSchema, type MeResponse } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { workspaceMembers, workspaces } from '../db/schema/index.js';
import type { UserRow } from './plugin.js';

/** Body of `GET /auth/me` (also returned by login, invite accept and `PATCH /me`). */
export async function buildMe(db: DbOrTx, user: UserRow): Promise<MeResponse> {
  const memberships = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
      title: workspaceMembers.title,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaceMembers.joinedAt));

  const accent = accentSchema.safeParse(user.accent);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      avatarColor: user.avatarColor,
    },
    preferences: {
      locale: user.locale,
      timezone: user.timezone,
      theme: user.theme,
      accent: accent.success ? accent.data : '#6E56CF',
      density: user.density,
      notificationPrefs: user.notificationPrefs,
    },
    workspaces: memberships,
  };
}
