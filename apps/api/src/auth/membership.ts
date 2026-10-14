import { isNull } from 'drizzle-orm';
import { workspaceMembers } from '../db/schema/index.js';

/**
 * The membership row is active (not deactivated). Every query that treats a `workspace_members`
 * row as "has access" / "can be picked" adds this; history queries don't.
 */
export const activeMember = isNull(workspaceMembers.deactivatedAt);

/** The same condition for raw SQL over `workspace_members` aliased as `alias`. */
export const activeMemberSql = (alias: string) => `${alias}.deactivated_at is null`;
