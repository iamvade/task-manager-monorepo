import { DEFAULT_STATUS_CATEGORIES } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import type { DbOrTx } from '../db/client.js';
import { statuses } from '../db/schema/index.js';

type StatusRow = typeof statuses.$inferSelect;

/** To Do / In Progress / In Review / Done, with null names (translated by the UI). */
export async function insertDefaultStatuses(db: DbOrTx, projectId: string) {
  const keys = generateNKeysBetween(null, null, DEFAULT_STATUS_CATEGORIES.length);
  return db
    .insert(statuses)
    .values(
      DEFAULT_STATUS_CATEGORIES.map((category, i) => ({
        projectId,
        name: null,
        category,
        color: null,
        position: keys[i] ?? '',
      })),
    )
    .returning();
}

export const listStatuses = (db: DbOrTx, projectId: string) =>
  db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(asc(statuses.position));

export const toStatusDto = (s: StatusRow) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  color: s.color,
  position: s.position,
});
