import { DEFAULT_STATUS_CATEGORIES, STATUS_CATEGORIES } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { DbOrTx } from '../db/client.js';
import { statuses } from '../db/schema/index.js';

type StatusRow = typeof statuses.$inferSelect;

/** To Do / In Progress / In Review / On Hold / Done / Cancelled, with null names (translated by the UI). */
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

/**
 * Gives every project a status for each default category it lacks (projects from before the
 * category was added), placed by category order among its statuses. Idempotent; runs after the
 * migrations, since a new enum value can't be used in the transaction that adds it.
 */
export async function ensureDefaultStatuses(db: DbOrTx): Promise<number> {
  const rows = await db
    .select({
      projectId: statuses.projectId,
      category: statuses.category,
      position: statuses.position,
    })
    .from(statuses)
    .orderBy(asc(statuses.projectId), asc(statuses.position));
  const byProject = new Map<string, { category: StatusRow['category']; position: string }[]>();
  for (const r of rows) {
    const list = byProject.get(r.projectId) ?? [];
    list.push(r);
    byProject.set(r.projectId, list);
  }
  const order = (c: StatusRow['category']) => STATUS_CATEGORIES.indexOf(c);
  const inserts: (typeof statuses.$inferInsert)[] = [];
  for (const [projectId, list] of byProject) {
    for (const category of DEFAULT_STATUS_CATEGORIES) {
      if (list.some((s) => s.category === category)) continue;
      // After the last status of an earlier category, before the next one.
      const at = list.findIndex((s) => order(s.category) > order(category));
      const index = at === -1 ? list.length : at;
      const position = generateKeyBetween(
        list[index - 1]?.position ?? null,
        list[index]?.position ?? null,
      );
      list.splice(index, 0, { category, position });
      inserts.push({ projectId, name: null, category, color: null, position });
    }
  }
  if (inserts.length > 0) await db.insert(statuses).values(inserts);
  return inserts.length;
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
