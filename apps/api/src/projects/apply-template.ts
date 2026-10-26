import {
  addDays,
  todayInZone,
  type ActivityPayload,
  type StatusCategory,
  type TaskActivityType,
  type TemplateId,
} from '@kite/shared';
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';
import type { UserRow } from '../auth/plugin.js';
import { activity, projects, tags, taskFollowers, taskTags, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { insertSprint } from '../sprints/query.js';
import { sprintSnapshot, statusSnapshot } from '../tasks/refs.js';
import { openSprintMemberships } from '../tasks/sprint.js';
import { closureStamps, openStatusPeriods, projectLead } from '../tasks/status.js';
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
        // An existing tag of the same name in any case is reused (names are case-insensitive).
        .onConflictDoNothing();
      const wanted = template.tags.map((t) => t.name.toLowerCase());
      const rows = await tx
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(
          and(eq(tags.workspaceId, project.workspaceId), inArray(sql`lower(${tags.name})`, wanted)),
        );
      tagIdByName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
    }

    // A new workspace sprint covering just this project.
    const sprint = template.sprint
      ? await insertSprint(tx, {
          workspaceId: project.workspaceId,
          name: pick(template.sprint.name),
          startDate: today,
          endDate: addDays(today, template.sprint.days - 1),
          projectIds: [projectId],
          createdBy: user.id,
        })
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

    const lead = planned.some((p) => p.status.category === 'review')
      ? await projectLead(tx, project)
      : null;
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
          reviewerId: status.category === 'review' ? (lead?.id ?? null) : null,
          dueDate: def.dueInDays === undefined ? null : addDays(today, def.dueInDays),
          position: positionsByStatus.get(status.id)?.shift() ?? '',
          createdBy: user.id,
          ...closureStamps(null, status.category, now),
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
        const tagId = tagIdByName.get(name.toLowerCase());
        if (!tagId) throw new Error(`Template ${templateId} uses unknown tag ${name}`);
        return { taskId: taskId(i), tagId };
      }),
    );
    if (tagRows.length > 0) await tx.insert(taskTags).values(tagRows);

    await openStatusPeriods(
      tx,
      planned.map(({ status }, i) => ({ taskId: taskId(i), status, at: now, actorId: user.id })),
    );
    if (sprint) {
      await openSprintMemberships(
        tx,
        planned.map((_, i) => ({
          taskId: taskId(i),
          sprintId: sprint.id,
          at: now,
          actorId: user.id,
        })),
      );
    }

    const row = (i: number, type: TaskActivityType, payload: Record<string, unknown>) => ({
      id: uuidv7(),
      workspaceId: project.workspaceId,
      projectId,
      taskId: taskId(i),
      actorId: user.id,
      type,
      payload,
      createdAt: now,
    });
    const activityRows = planned.flatMap(({ status }, i) => [
      row(i, 'task.created', {
        status: statusSnapshot(status),
        templateId,
      } satisfies ActivityPayload<'task.created'>),
      ...(sprint
        ? [
            row(i, 'sprint.changed', {
              from: null,
              to: sprintSnapshot(sprint),
            } satisfies ActivityPayload<'sprint.changed'>),
          ]
        : []),
      ...(lead && status.category === 'review'
        ? [
            row(i, 'reviewer.changed', {
              from: null,
              to: lead,
            } satisfies ActivityPayload<'reviewer.changed'>),
          ]
        : []),
    ]);
    await tx.insert(activity).values(activityRows);

    return { createdCount: created.length, project: updated ?? project, activityRows };
  });

  const byTask = new Map<string, typeof result.activityRows>();
  for (const r of result.activityRows) byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
  for (const [taskId, rows] of byTask) {
    app.events.emit({
      type: 'task.created',
      workspaceId: rows[0]?.workspaceId ?? '',
      projectId,
      taskId,
      actorId: user.id,
      activities: rows.map(({ id, type, payload }) => ({ id, type, payload })),
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
