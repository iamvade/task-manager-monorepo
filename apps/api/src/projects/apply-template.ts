import { addDays, todayInZone, type StatusCategory, type TemplateId } from '@kite/shared';
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';
import type { UserRow } from '../auth/plugin.js';
import { one } from '../db/rows.js';
import {
  activity,
  projects,
  sprints,
  tags,
  taskFollowers,
  taskTags,
  tasks,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { buildProjectDetail } from './detail.js';
import { listStatuses } from './statuses.js';
import { TEMPLATES, type Text } from './templates/index.js';

/**
 * Fills an empty project with a template's tasks (plus its sprint and tags) in one transaction.
 * Titles use the caller's language; due dates count from today in the caller's time zone.
 */
export async function applyTemplate(
  app: FastifyInstance,
  projectId: string,
  templateId: TemplateId,
  user: UserRow,
) {
  const db = app.db;
  const template = TEMPLATES[templateId];
  const pick = (text: Text) => text[user.locale === 'mn' ? 0 : 1];
  const today = todayInZone(user.timezone);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // The row lock serializes concurrent applies (and task creation) on this project.
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update');
    if (!project) throw httpError(404, 'NOT_FOUND', 'Project not found');

    const [liveTask] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .limit(1);
    if (liveTask) {
      throw httpError(
        409,
        'PROJECT_NOT_EMPTY',
        'Templates can only be applied to an empty project',
      );
    }

    const statusRows = await listStatuses(tx, projectId);
    const fallback = statusRows[0];
    if (!fallback) throw new Error(`Project ${projectId} has no statuses`);
    const statusFor = (category: StatusCategory) =>
      statusRows.find((s) => s.category === category) ?? fallback;

    let tagIdByName = new Map<string, string>();
    if (template.tags?.length) {
      await tx
        .insert(tags)
        .values(template.tags.map((t) => ({ workspaceId: project.workspaceId, ...t })))
        .onConflictDoNothing({ target: [tags.workspaceId, tags.name] });
      const rows = await tx
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(
          and(
            eq(tags.workspaceId, project.workspaceId),
            inArray(
              tags.name,
              template.tags.map((t) => t.name),
            ),
          ),
        );
      tagIdByName = new Map(rows.map((r) => [r.name, r.id]));
    }

    const sprint = template.sprint
      ? one(
          await tx
            .insert(sprints)
            .values({
              projectId,
              name: pick(template.sprint.name),
              startDate: today,
              endDate: addDays(today, template.sprint.days - 1),
            })
            .returning(),
          'sprint',
        )
      : undefined;

    // Append after any soft-deleted tasks so positions never collide.
    const lastPositions = await tx
      .select({ statusId: tasks.statusId, last: max(tasks.position) })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.statusId);
    const planned = template.tasks.map((def) => ({
      def,
      status: statusFor(def.category ?? 'todo'),
    }));
    const positionsByStatus = new Map<string, string[]>();
    for (const status of new Set(planned.map((p) => p.status))) {
      const n = planned.filter((p) => p.status === status).length;
      const last = lastPositions.find((r) => r.statusId === status.id)?.last ?? null;
      positionsByStatus.set(status.id, generateNKeysBetween(last, null, n));
    }

    const created = await tx
      .insert(tasks)
      .values(
        planned.map(({ def, status }, i) => ({
          projectId,
          number: project.taskSeq + i + 1,
          statusId: status.id,
          sprintId: sprint?.id ?? null,
          title: pick(def.title),
          priority: def.priority,
          dueDate: def.dueInDays === undefined ? null : addDays(today, def.dueInDays),
          position: positionsByStatus.get(status.id)?.shift() ?? '',
          createdBy: user.id,
          completedAt: status.category === 'done' ? now : null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: tasks.id, number: tasks.number });
    const idByNumber = new Map(created.map((t) => [t.number, t.id]));
    const taskId = (i: number) => {
      const id = idByNumber.get(project.taskSeq + i + 1);
      if (!id) throw new Error('Template task missing after insert');
      return id;
    };

    const [updated] = await tx
      .update(projects)
      .set({ taskSeq: sql`${projects.taskSeq} + ${created.length}` })
      .where(eq(projects.id, projectId))
      .returning();

    await tx.insert(taskFollowers).values(created.map((t) => ({ taskId: t.id, userId: user.id })));

    const tagRows = template.tasks.flatMap((def, i) =>
      (def.tags ?? []).map((name) => {
        const tagId = tagIdByName.get(name);
        if (!tagId) throw new Error(`Template ${templateId} uses unknown tag ${name}`);
        return { taskId: taskId(i), tagId };
      }),
    );
    if (tagRows.length > 0) await tx.insert(taskTags).values(tagRows);

    const activityRows = template.tasks.map((_, i) => ({
      id: uuidv7(),
      workspaceId: project.workspaceId,
      projectId,
      taskId: taskId(i),
      actorId: user.id,
      type: 'task.created' as const,
      payload: { templateId },
      createdAt: now,
    }));
    await tx.insert(activity).values(activityRows);

    return { createdCount: created.length, project: updated ?? project, activityRows };
  });

  for (const { id, type, payload, ...row } of result.activityRows) {
    app.events.emit({
      type: 'task.created',
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      taskId: row.taskId,
      actorId: row.actorId,
      activities: [{ id, type, payload }],
      assigneeIds: [],
      at: now,
    });
  }
  // Built outside the transaction: the detail runs its queries in parallel on the pool.
  return {
    createdCount: result.createdCount,
    project: await buildProjectDetail(db, result.project, user),
  };
}
