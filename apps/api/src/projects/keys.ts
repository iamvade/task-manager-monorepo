import { projectKeyCandidates } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { projects } from '../db/schema/index.js';

/** The best key for `name` not yet used in the workspace. */
export async function pickProjectKey(db: DbOrTx, workspaceId: string, name: string) {
  const rows = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));
  const taken = new Set(rows.map((r) => r.key));
  const key = projectKeyCandidates(name).find((candidate) => !taken.has(candidate));
  if (!key) throw new Error(`No free project key for "${name}"`);
  return key;
}
