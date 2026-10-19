import type { RichTextNode, Size, StatusCategory } from '@kite/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../src/db/client.js';
import { positionAfter } from '../src/db/position.js';
import { one } from '../src/db/rows.js';
import {
  activity,
  comments,
  projects,
  sprintMemberships,
  sprintProjects,
  sprints,
  statuses,
  taskAssignees,
  taskStatusPeriods,
  tasks,
  workspaceHolidays,
} from '../src/db/schema/index.js';

/**
 * Report fixtures: rows written directly with explicit timestamps, so tests can lay out weeks
 * of history against a frozen clock. Each task is written in one transaction with its status
 * periods and sprint memberships, which the deferred consistency triggers check at commit.
 */

const at = (iso: string) => new Date(iso);

export interface TimelineTask {
  projectId: string;
  createdBy: string;
  title?: string;
  /** Status categories entered, in order, with when (ISO). The last one is the current status. */
  timeline: [StatusCategory, string][];
  dueDate?: string | null;
  size?: Size | null;
  assigneeIds?: string[];
  reviewerId?: string | null;
  /** Who closed each period (default `createdBy`); index i closes period i. */
  exitedBy?: (string | undefined)[];
  /** Sprint memberships, oldest first; the open one (no `removed`) is the current sprint. */
  sprints?: { sprintId: string; added: string; removed?: string }[];
}

/** Inserts a task with its status timeline and sprint history. */
export async function timelineTask(db: Db, input: TimelineTask) {
  return db.transaction(async (tx) => {
    const projectStatuses = await tx
      .select()
      .from(statuses)
      .where(eq(statuses.projectId, input.projectId));
    const statusOf = (category: StatusCategory) => {
      const s = projectStatuses.find((x) => x.category === category);
      if (!s) throw new Error(`no ${category} status`);
      return s;
    };
    const [first] = input.timeline;
    const last = input.timeline[input.timeline.length - 1];
    if (!first || !last) throw new Error('empty timeline');
    const { taskSeq } = one(
      await tx
        .update(projects)
        .set({ taskSeq: sql`${projects.taskSeq} + 1` })
        .where(eq(projects.id, input.projectId))
        .returning({ taskSeq: projects.taskSeq }),
    );
    const openSprint = input.sprints?.find((s) => !s.removed);
    // A real fractional key at the end of the status (the project row update above holds the
    // lock), so later API creates and moves can place tasks after it.
    const statusId = statusOf(last[0]).id;
    const [tail] = await tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(eq(tasks.statusId, statusId))
      .orderBy(desc(tasks.position))
      .limit(1);
    const task = one(
      await tx
        .insert(tasks)
        .values({
          projectId: input.projectId,
          number: taskSeq,
          statusId,
          sprintId: openSprint?.sprintId ?? null,
          title: input.title ?? `Task ${taskSeq}`,
          priority: 'medium',
          size: input.size ?? null,
          reviewerId: input.reviewerId ?? null,
          dueDate: input.dueDate ?? null,
          position: positionAfter(tail?.position),
          createdBy: input.createdBy,
          completedAt: last[0] === 'done' ? at(last[1]) : null,
          createdAt: at(first[1]),
        })
        .returning(),
    );
    if (input.assigneeIds?.length) {
      await tx
        .insert(taskAssignees)
        .values(input.assigneeIds.map((userId) => ({ taskId: task.id, userId })));
    }
    await tx.insert(taskStatusPeriods).values(
      input.timeline.map(([category, enteredAt], i) => {
        const next = input.timeline[i + 1];
        return {
          taskId: task.id,
          statusId: statusOf(category).id,
          category,
          enteredAt: at(enteredAt),
          exitedAt: next ? at(next[1]) : null,
          enteredBy: input.createdBy,
          exitedBy: next ? (input.exitedBy?.[i] ?? input.createdBy) : null,
        };
      }),
    );
    if (input.sprints?.length) {
      await tx.insert(sprintMemberships).values(
        input.sprints.map((s) => ({
          taskId: task.id,
          sprintId: s.sprintId,
          addedAt: at(s.added),
          removedAt: s.removed ? at(s.removed) : null,
          addedBy: input.createdBy,
          removedBy: s.removed ? input.createdBy : null,
        })),
      );
    }
    return task;
  });
}

/** A workspace sprint covering `projectIds` (the workspace is the first project's). */
export async function insertSprint(
  db: Db,
  projectIds: string | readonly string[],
  number: number,
  startDate: string,
  endDate: string,
  name: string | null = null,
) {
  const ids = typeof projectIds === 'string' ? [projectIds] : projectIds;
  const [first] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, ids[0] ?? ''));
  if (!first) throw new Error('insertSprint: unknown project');
  const sprint = one(
    await db
      .insert(sprints)
      .values({ workspaceId: first.workspaceId, number, name, startDate, endDate })
      .returning(),
  );
  await db
    .insert(sprintProjects)
    .values(ids.map((projectId) => ({ sprintId: sprint.id, projectId })));
  return sprint;
}

export async function insertHoliday(db: Db, workspaceId: string, date: string) {
  await db.insert(workspaceHolidays).values({ workspaceId, date, name: 'Holiday' });
}

/** A comment document, optionally starting with an @mention. */
export const commentBody = (text: string, mentionId?: string): RichTextNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        ...(mentionId ? [{ type: 'mention', attrs: { id: mentionId, label: 'X' } }] : []),
        { type: 'text', text },
      ],
    },
  ],
});

export async function insertComment(
  db: Db,
  taskId: string,
  authorId: string,
  createdAt: string,
  mentionId?: string,
) {
  return one(
    await db
      .insert(comments)
      .values({
        taskId,
        authorId,
        body: commentBody('hello', mentionId),
        bodyText: 'hello',
        createdAt: at(createdAt),
      })
      .returning(),
  );
}

export async function insertActivity(
  db: Db,
  row: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    actorId: string;
    type: typeof activity.$inferInsert.type;
    payload: Record<string, unknown>;
    createdAt: string;
  },
) {
  await db.insert(activity).values({ ...row, createdAt: at(row.createdAt) });
}
