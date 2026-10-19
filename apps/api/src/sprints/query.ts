import type { Sprint } from '@kite/shared';
import { asc, eq, inArray, max } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db/client.js';
import { sprintProjects, sprints, workspaces } from '../db/schema/index.js';

type SprintRow = typeof sprints.$inferSelect;

export const toSprintDto = (s: SprintRow, projectIds: readonly string[]): Sprint => ({
  id: s.id,
  number: s.number,
  name: s.name,
  startDate: s.startDate,
  endDate: s.endDate,
  projectIds: [...projectIds],
  createdBy: s.createdBy,
});

/** Project ids of each sprint (sorted, for stable output). */
export async function projectIdsOf(
  db: DbOrTx,
  sprintIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(sprintIds.map((id) => [id, []]));
  if (sprintIds.length === 0) return out;
  const rows = await db
    .select()
    .from(sprintProjects)
    .where(inArray(sprintProjects.sprintId, [...new Set(sprintIds)]))
    .orderBy(asc(sprintProjects.projectId));
  for (const r of rows) out.get(r.sprintId)?.push(r.projectId);
  return out;
}

/** DTOs for sprint rows, in the given order. */
export async function sprintDtos(db: DbOrTx, rows: readonly SprintRow[]): Promise<Sprint[]> {
  const ids = await projectIdsOf(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toSprintDto(r, ids.get(r.id) ?? []));
}

export async function sprintDto(db: DbOrTx, row: SprintRow): Promise<Sprint> {
  const [dto] = await sprintDtos(db, [row]);
  return dto ?? toSprintDto(row, []);
}

/**
 * Inserts a sprint with the workspace's next number. The workspace row lock serializes number
 * allocation, so take it before anything else in the transaction that might wait on it.
 */
export async function insertSprint(
  tx: Tx,
  values: {
    workspaceId: string;
    name?: string | null;
    startDate: string;
    endDate: string;
    projectIds: readonly string[];
    createdBy: string | null;
  },
): Promise<SprintRow> {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, values.workspaceId))
    .for('no key update');
  const [last] = await tx
    .select({ number: max(sprints.number) })
    .from(sprints)
    .where(eq(sprints.workspaceId, values.workspaceId));
  const [sprint] = await tx
    .insert(sprints)
    .values({
      workspaceId: values.workspaceId,
      number: (last?.number ?? 0) + 1,
      name: values.name ?? null,
      startDate: values.startDate,
      endDate: values.endDate,
      createdBy: values.createdBy,
    })
    .returning();
  if (!sprint) throw new Error('Expected one sprint, got none');
  await tx
    .insert(sprintProjects)
    .values(values.projectIds.map((projectId) => ({ sprintId: sprint.id, projectId })));
  return sprint;
}
