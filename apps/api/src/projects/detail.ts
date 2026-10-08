import { todayInZone, type ProjectDetail } from '@kite/shared';
import { and, count, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { UserRow } from '../auth/plugin.js';
import type { Db } from '../db/client.js';
import { one } from '../db/rows.js';
import { favorites, spaces, sprints, tasks, type projects } from '../db/schema/index.js';
import { listMembers } from './members.js';
import { listStatuses, toStatusDto } from './statuses.js';

type ProjectRow = typeof projects.$inferSelect;
type SprintRow = typeof sprints.$inferSelect;

export const toSprintDto = (s: SprintRow) => ({
  id: s.id,
  projectId: s.projectId,
  name: s.name,
  startDate: s.startDate,
  endDate: s.endDate,
});

/**
 * Body of `GET /projects/:id`, as seen by `user` (favorite flag, "today" for the sprint). Runs its
 * queries in parallel, so pass the pool, not a transaction.
 */
export async function buildProjectDetail(
  db: Db,
  project: ProjectRow,
  user: UserRow,
): Promise<ProjectDetail> {
  const today = todayInZone(user.timezone);
  const [space, statusRows, members, favorite, activeSprint, counts] = await Promise.all([
    db
      .select()
      .from(spaces)
      .where(eq(spaces.id, project.spaceId))
      .then((rows) => one(rows, 'space')),
    listStatuses(db, project.id),
    listMembers(db, project.workspaceId, { projectId: project.id }),
    db
      .select({ projectId: favorites.projectId })
      .from(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.projectId, project.id)))
      .limit(1),
    db
      .select()
      .from(sprints)
      .where(
        and(
          eq(sprints.projectId, project.id),
          lte(sprints.startDate, today),
          gte(sprints.endDate, today),
        ),
      )
      .orderBy(desc(sprints.startDate))
      .limit(1),
    db
      .select({ statusId: tasks.statusId, count: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)))
      .groupBy(tasks.statusId),
  ]);

  const countByStatus = new Map(counts.map((c) => [c.statusId, c.count]));
  const taskCounts = statusRows.map((s) => ({
    statusId: s.id,
    count: countByStatus.get(s.id) ?? 0,
  }));
  const doneIds = new Set(statusRows.filter((s) => s.category === 'done').map((s) => s.id));
  const [sprint] = activeSprint;

  return {
    id: project.id,
    workspaceId: project.workspaceId,
    spaceId: project.spaceId,
    key: project.key,
    name: project.name,
    color: project.color,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    space: { id: space.id, name: space.name, initial: space.initial, color: space.color },
    position: project.position,
    createdAt: project.createdAt.toISOString(),
    isFavorite: favorite.length > 0,
    statuses: statusRows.map(toStatusDto),
    members,
    activeSprint: sprint ? toSprintDto(sprint) : null,
    taskCounts,
    taskCount: taskCounts.reduce((sum, c) => sum + c.count, 0),
    doneCount: taskCounts.filter((c) => doneIds.has(c.statusId)).reduce((s, c) => s + c.count, 0),
  };
}
