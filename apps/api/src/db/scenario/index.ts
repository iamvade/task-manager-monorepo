import argon2 from 'argon2';
import { eq, like, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as schema from '../schema/index.js';
import { PASSWORD } from '../seed/data.js';
import { createClock } from '../seed/dates.js';
import { buildScenario, type ScenarioRows } from './generate.js';
import { LARGE } from './large.js';
import { SMALL } from './small.js';
import type { ScenarioDef } from './types.js';

export const SCENARIOS = { small: SMALL, large: LARGE } as const satisfies Record<
  string,
  ScenarioDef
>;
export type ScenarioName = keyof typeof SCENARIOS;

/** Removes the scenario's workspace and its people (matched by the scenario's email domain). */
export async function dropScenario(db: Db, def: ScenarioDef): Promise<boolean> {
  const [ws] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, def.slug));
  if (ws) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, ws.id));
  const removed = await db
    .delete(schema.users)
    .where(like(schema.users.email, `%@${def.emailDomain}`))
    .returning({ id: schema.users.id });
  return Boolean(ws) || removed.length > 0;
}

/**
 * Builds a scenario workspace next to whatever else is in the database (the dev seed included),
 * replacing an earlier run of the same scenario. One transaction: the deferred status-period /
 * sprint-membership checks run at commit.
 */
export async function runScenario(
  db: Db,
  def: ScenarioDef,
  options: { today?: string } = {},
): Promise<void> {
  const started = performance.now();
  if (await dropScenario(db, def)) console.log(`Removed the previous "${def.name}".`);

  const clock = createClock(options.today);
  const rows = buildScenario(def, {
    now: clock.now,
    passwordHash: await argon2.hash(PASSWORD),
  });

  await db.transaction(async (tx) => {
    const insert = async <T extends Parameters<typeof tx.insert>[0]>(
      table: T,
      values: T['$inferInsert'][],
    ) => {
      const first = values[0];
      if (!first) return;
      // Stay well under Postgres' 65,535 bind parameters per statement.
      const size = Math.max(1, Math.floor(30_000 / Object.keys(first).length));
      for (let i = 0; i < values.length; i += size) {
        await tx.insert(table).values(values.slice(i, i + size));
      }
    };
    await insert(schema.users, rows.users);
    await insert(schema.workspaces, [rows.workspace]);
    await insert(schema.workspaceMembers, rows.members);
    await insert(schema.workspaceHolidays, rows.holidays);
    await insert(schema.spaces, rows.spaces);
    await insert(schema.projects, rows.projects);
    await insert(schema.projectMembers, rows.projectMembers);
    await insert(schema.favorites, rows.favorites);
    await insert(schema.statuses, rows.statuses);
    await insert(schema.sprints, rows.sprints);
    await insert(schema.tags, rows.tags);
    await insert(schema.tasks, rows.tasks);
    await insert(schema.taskStatusPeriods, rows.periods);
    await insert(schema.sprintMemberships, rows.memberships);
    await insert(schema.taskAssignees, rows.assignees);
    await insert(schema.taskTags, rows.taskTags);
    await insert(schema.taskFollowers, rows.followers);
    await insert(schema.subtasks, rows.subtasks);
    // Parents first: replies reference them.
    await insert(
      schema.comments,
      rows.comments.filter((c) => !c.parentId),
    );
    await insert(
      schema.comments,
      rows.comments.filter((c) => c.parentId),
    );
    await insert(schema.activity, rows.activity);
    await insert(schema.notifications, rows.notifications);
    await insert(schema.userAbsences, rows.absences);
    await insert(schema.standupGroups, rows.standupGroups);
    await insert(schema.standupGroupMembers, rows.standupGroupMembers);
    await insert(schema.standupEntries, rows.standupEntries);
    await insert(schema.standupBlockers, rows.standupBlockers);
    await insert(schema.standupReactions, rows.standupReactions);
    await insert(schema.standupReplies, rows.standupReplies);
    await insert(schema.standupMeetings, rows.standupMeetings);
    await insert(schema.standupNotices, rows.standupNotices);
    await insert(schema.notifications, rows.standupNotifications);
  });
  await db.execute(sql`analyze`);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  printSummary(def, rows, clock, seconds);
}

function printSummary(
  def: ScenarioDef,
  rows: ScenarioRows,
  { today, now: nowDate }: { today: string; now: Date },
  seconds: string,
) {
  const live = rows.tasks.filter((t) => !t.deletedAt);
  const open = live.filter((t) => !t.completedAt);
  const now = nowDate.getTime();
  const stale = open.filter((t) => t.updatedAt && now - t.updatedAt.getTime() > 30 * 86_400_000);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const unassigned = new Set(rows.assignees.map((a) => a.taskId));
  const perTask = new Map<string, number>();
  for (const c of rows.comments) perTask.set(c.taskId, (perTask.get(c.taskId) ?? 0) + 1);
  const threads = [...perTask.values()];
  const perProject = new Map<string, number>();
  for (const t of rows.tasks) perProject.set(t.projectId, (perProject.get(t.projectId) ?? 0) + 1);
  const biggest = [...rows.projects]
    .sort((a, b) => (perProject.get(b.id ?? '') ?? 0) - (perProject.get(a.id ?? '') ?? 0))
    .slice(0, 4)
    .map((p) => `${p.key} ${perProject.get(p.id ?? '') ?? 0}`);
  const n = (x: number) => x.toLocaleString('en-US');

  console.log(
    [
      `\nSeeded "${def.name}" (today ${today}) in ${seconds}s:`,
      `  ${n(rows.members.length)} members (+${rows.users.length - rows.members.length} who left), ` +
        `${rows.spaces.length} spaces, ${rows.projects.length} projects ` +
        `(${rows.projects.filter((p) => p.archivedAt).length} archived), ${n(rows.tags.length)} tags, ` +
        `${n(rows.sprints.length)} sprints`,
      `  ${n(rows.tasks.length)} tasks: ${n(open.length)} open, ${n(overdue.length)} overdue, ` +
        `${n(stale.length)} untouched for 30+ days, ` +
        `${n(live.filter((t) => !unassigned.has(t.id)).length)} unassigned, ` +
        `${n(live.filter((t) => !t.dueDate).length)} without a due date, ` +
        `${n(rows.tasks.length - live.length)} deleted`,
      `  biggest projects: ${biggest.join(', ')}`,
      `  ${n(rows.comments.length)} comments (${n(threads.filter((c) => c >= 50).length)} threads with 50+, ` +
        `longest ${Math.max(0, ...threads)}), ${n(rows.activity.length)} activity rows, ` +
        `${n(rows.periods.length)} status periods, ${n(rows.notifications.length)} notifications`,
      `  ${n(rows.standupGroups.length)} standup groups ` +
        `(largest ${Math.max(0, ...rows.standupGroups.map((g) => rows.standupGroupMembers.filter((m) => m.groupId === g.id).length))} people), ` +
        `${n(rows.standupEntries.length)} updates, ${n(rows.standupBlockers.length)} blockers ` +
        `(${n(rows.standupBlockers.filter((b) => !b.resolvedAt).length)} open), ` +
        `${n(rows.standupMeetings.length)} past meetings, ${n(rows.absences.length)} out-of-office periods`,
    ].join('\n'),
  );

  const byKey = new Map(rows.people.map((p) => [p.def.key, p]));
  const lines = def.credentials.flatMap(([label, key]) => {
    const p = byKey.get(key);
    return p ? [{ label, name: p.name, email: p.email, note: p.def.note ?? '' }] : [];
  });
  const w = (k: 'label' | 'name' | 'email') => Math.max(...lines.map((l) => l[k].length));
  console.log(`\nLogins (password for everyone: ${PASSWORD}):`);
  for (const l of lines) {
    console.log(
      `  ${l.label.padEnd(w('label'))}  ${l.name.padEnd(w('name'))}  ${l.email.padEnd(w('email'))}` +
        (l.note ? `  ${l.note}` : ''),
    );
  }
  if (rows.users.length > rows.members.length) {
    console.log(
      '  (people who left are no longer workspace members: signing in shows no workspace)',
    );
  }
  console.log('');
}
