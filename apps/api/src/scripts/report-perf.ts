/**
 * Performance check: `pnpm db:perf` (add `--drop` to remove the data, `--fresh` to rebuild it).
 * Builds a "Perf" workspace in DATABASE_URL with 10k tasks and ~24 weeks of history (status
 * periods, sprints with carry-overs, comments with @mentions, subtasks, tags, attachments), then
 * - times every report endpoint uncached (median of 5) and prints EXPLAIN ANALYZE for the
 *   slowest query of the slowest report;
 * - times the task list endpoints (project/space List view, My Tasks) and prints EXPLAIN ANALYZE
 *   for each list query variant, with the full plan of the slowest.
 * Target: every endpoint under 300 ms.
 */
import {
  DEFAULT_STATUS_CATEGORIES,
  SIZES,
  addDays,
  startOfWeek,
  todayInZone,
  type StatusCategory,
} from '@kite/shared';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { buildApp } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/client.js';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../db/holidays.js';
import { positionAfter } from '../db/position.js';
import {
  activity,
  attachments,
  comments,
  projectMembers,
  projects,
  spaces,
  sprintMemberships,
  sprints,
  statuses,
  subtasks,
  tags,
  taskAssignees,
  taskStatusPeriods,
  taskTags,
  tasks,
  users,
  workspaceHolidays,
  workspaceMembers,
  workspaces,
} from '../db/schema/index.js';
import { overviewQueries, periodBounds } from '../reports/overview.js';
import { personQueries } from '../reports/people.js';
import type { ReportContext } from '../reports/scope.js';
import { planSprints, sprintQueries } from '../reports/sprints.js';
import { workloadQueries } from '../reports/workload.js';
import { projectTaskListQuery, spaceTaskListQuery } from '../tasks/list.js';

const TASKS = 10_000;
const PEOPLE = 30;
const PROJECTS = 10;
const SPRINTS = 12;
const SLUG = 'perf';
const PASSWORD = 'password123';
const TZ = 'Asia/Ulaanbaatar';
const RUNS = 5;
const TARGET_MS = 300;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const UB_OFFSET = 8 * HOUR;

const args = new Set(process.argv.slice(2));
const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);

// Deterministic randomness (mulberry32), so runs are comparable.
let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};
const chance = (p: number) => rand() < p;
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('empty list');
  return item;
};
/** Log-normal duration around `medianMs`. */
const lognormal = (medianMs: number, sigma = 0.8) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return medianMs * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
};
/** Midnight at the start of a local (Ulaanbaatar) date. */
const localMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - UB_OFFSET;
const localDate = (ms: number) => new Date(ms + UB_OFFSET).toISOString().slice(0, 10);

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 1000) await insert(rows.slice(i, i + 1000));
}

async function dropPerf(database: Db) {
  const [ws] = await database.select().from(workspaces).where(eq(workspaces.slug, SLUG));
  if (ws) await database.delete(workspaces).where(eq(workspaces.id, ws.id));
  const emails = Array.from({ length: PEOPLE }, (_, i) => `perf-${i + 1}@kite.test`);
  await database.delete(users).where(inArray(users.email, emails));
}

async function generate(database: Db) {
  const passwordHash = await hashPassword(PASSWORD);
  const nowMs = Date.now();
  const today = todayInZone(TZ, new Date(nowMs));
  const people = Array.from({ length: PEOPLE }, (_, i) => ({
    id: uuidv7(),
    email: `perf-${i + 1}@kite.test`,
    name: `Perf Person ${i + 1}`,
    initials: `P${i + 1}`.slice(0, 2),
    avatarColor: pick([
      'indigo',
      'green',
      'rose',
      'amber',
      'sky',
      'purple',
      'teal',
      'yellow',
    ] as const),
    passwordHash,
  }));
  const personIds = people.map((p) => p.id);

  await database.transaction(async (tx) => {
    await tx.insert(users).values(people);
    const workspaceId = uuidv7();
    await tx.insert(workspaces).values({ id: workspaceId, name: 'Perf', slug: SLUG });
    await tx.insert(workspaceMembers).values(
      people.map((p, i) => ({
        workspaceId,
        userId: p.id,
        role: i === 0 ? ('owner' as const) : i < 3 ? ('admin' as const) : ('member' as const),
        title: pick(['Engineer', 'Designer', 'Product manager', 'QA']),
      })),
    );
    await tx
      .insert(workspaceHolidays)
      .values(MN_PUBLIC_HOLIDAYS_2026.map((h) => ({ workspaceId, ...h })));
    const spaceRows = [0, 1, 2].map((i) => ({
      id: uuidv7(),
      workspaceId,
      name: `Space ${i + 1}`,
      initial: `S`,
      color: 'violet' as const,
      position: `a${i}`,
    }));
    await tx.insert(spaces).values(spaceRows);

    const projectRows = Array.from({ length: PROJECTS }, (_, i) => ({
      id: uuidv7(),
      workspaceId,
      spaceId: pick(spaceRows).id,
      name: `Perf project ${i + 1}`,
      key: `PF${String.fromCharCode(65 + i)}`,
      color: 'blue' as const,
      position: `a${i}`,
      leadId: pick(personIds),
    }));
    await tx.insert(projects).values(projectRows);

    const statusOf = new Map<string, Record<StatusCategory, string>>();
    const statusRows = projectRows.flatMap((p) => {
      const ids = {} as Record<StatusCategory, string>;
      const rows = DEFAULT_STATUS_CATEGORIES.map((category, i) => {
        const id = uuidv7();
        ids[category] = id;
        return { id, projectId: p.id, category, position: `a${i}` };
      });
      statusOf.set(p.id, ids);
      return rows;
    });
    await tx.insert(statuses).values(statusRows);

    const teams = new Map<string, string[]>();
    for (const p of projectRows) {
      const team = [...personIds].sort(() => rand() - 0.5).slice(0, 10);
      teams.set(p.id, team);
    }
    await tx
      .insert(projectMembers)
      .values(
        projectRows.flatMap((p) =>
          (teams.get(p.id) ?? []).map((userId) => ({ projectId: p.id, userId })),
        ),
      );

    // Two-week sprints, Monday → Friday of the next week; the last one holds today.
    const currentStart = startOfWeek(today);
    const sprintRows = projectRows.flatMap((p) =>
      Array.from({ length: SPRINTS }, (_, k) => {
        const start = addDays(currentStart, -(SPRINTS - 1 - k) * 14);
        return {
          id: uuidv7(),
          projectId: p.id,
          number: k + 1,
          startDate: start,
          endDate: addDays(start, 11),
        };
      }),
    );
    await tx.insert(sprints).values(sprintRows);
    const sprintsOf = (projectId: string) =>
      sprintRows
        .filter((s) => s.projectId === projectId)
        .map((s) => ({
          ...s,
          planning: localMidnight(addDays(s.startDate, -2)) + 16 * HOUR,
          endAt: localMidnight(addDays(s.endDate, 1)),
        }));
    const sprintCache = new Map(projectRows.map((p) => [p.id, sprintsOf(p.id)]));

    const taskRows: (typeof tasks.$inferInsert)[] = [];
    const assigneeRows: (typeof taskAssignees.$inferInsert)[] = [];
    const periodRows: (typeof taskStatusPeriods.$inferInsert)[] = [];
    const membershipRows: (typeof sprintMemberships.$inferInsert)[] = [];
    const commentRows: (typeof comments.$inferInsert)[] = [];
    const activityRows: (typeof activity.$inferInsert)[] = [];
    const seq = new Map<string, number>();

    for (let i = 0; i < TASKS; i++) {
      const project = projectRows[i % PROJECTS];
      if (!project) continue;
      const team = teams.get(project.id) ?? personIds;
      const ids = statusOf.get(project.id);
      if (!ids) continue;
      const createdAt = nowMs - rand() * 168 * DAY;
      const creator = pick(team);

      // Lifecycle, cut off at now.
      const steps: [StatusCategory, number][] = [['todo', createdAt]];
      let t = createdAt + lognormal(1.5 * DAY);
      steps.push(['in_progress', t]);
      t += lognormal(2 * DAY);
      const reviewed = chance(0.6);
      if (reviewed) {
        steps.push(['review', t]);
        t += lognormal(3 * DAY);
      }
      steps.push(['done', t]);
      if (chance(0.05)) {
        t += lognormal(DAY);
        steps.push(['in_progress', t]);
        t += lognormal(DAY);
        steps.push(['done', t]);
      }
      const timeline = steps.filter(([, at]) => at < nowMs - 60_000);
      const last = timeline[timeline.length - 1] ?? ['todo', createdAt];
      const completedAt = last[0] === 'done' ? last[1] : null;
      const number = (seq.get(project.id) ?? 0) + 1;
      seq.set(project.id, number);
      const taskId = uuidv7();
      const assignees = chance(0.05) ? [] : chance(0.1) ? [pick(team), pick(team)] : [pick(team)];
      const uniqueAssignees = [...new Set(assignees)];

      // Sprint chain: the sprint running when the task appeared, carried while unfinished.
      let sprintId: string | null = null;
      if (chance(0.7)) {
        const chain = sprintCache.get(project.id) ?? [];
        let k = chain.findIndex((s) => s.endAt > createdAt);
        let added = k >= 0 && (chain[k]?.planning ?? 0) < createdAt ? createdAt + 5 * 60_000 : null;
        while (k >= 0 && k < chain.length) {
          const s = chain[k];
          if (!s) break;
          const addedAt = added ?? s.planning;
          if (addedAt > nowMs) break;
          const next = chain[k + 1];
          const finished = completedAt !== null && completedAt < s.endAt;
          const carried = !finished && next && next.planning < nowMs;
          membershipRows.push({
            taskId,
            sprintId: s.id,
            addedAt: new Date(addedAt),
            removedAt: carried ? new Date(next.planning) : null,
            addedBy: creator,
            removedBy: carried ? creator : null,
          });
          if (!carried) {
            sprintId = s.id;
            break;
          }
          added = null;
          k++;
        }
      }

      taskRows.push({
        id: taskId,
        projectId: project.id,
        number,
        statusId: ids[last[0]],
        sprintId,
        title: `Perf task ${i + 1}`,
        priority: pick(['urgent', 'high', 'medium', 'low', 'none'] as const),
        size: chance(0.15) ? null : pick(SIZES),
        reviewerId: reviewed && chance(0.8) ? pick(team) : null,
        dueDate: chance(0.7) ? localDate(createdAt + (3 + rand() * 17) * DAY) : null,
        position: `a${String(i).padStart(6, '0')}`,
        createdBy: creator,
        completedAt: completedAt === null ? null : new Date(completedAt),
        createdAt: new Date(createdAt),
        updatedAt: new Date(last[1]),
      });
      for (const userId of uniqueAssignees) assigneeRows.push({ taskId, userId });
      timeline.forEach(([category, at], j) => {
        const next = timeline[j + 1];
        periodRows.push({
          taskId,
          statusId: ids[category],
          category,
          enteredAt: new Date(at),
          exitedAt: next ? new Date(next[1]) : null,
          enteredBy: creator,
          exitedBy: next ? pick(team) : null,
        });
        activityRows.push({
          workspaceId,
          projectId: project.id,
          taskId,
          actorId: creator,
          type: j === 0 ? 'task.created' : 'status.changed',
          payload: {},
          createdAt: new Date(at),
        });
      });

      const end = completedAt ?? nowMs;
      const commentCount = Math.floor(rand() * 4);
      for (let c = 0; c < commentCount; c++) {
        const at = createdAt + rand() * (end - createdAt);
        const author = pick(team);
        const mentioned = chance(0.3) ? pick(personIds) : null;
        commentRows.push({
          taskId,
          authorId: author,
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  ...(mentioned ? [{ type: 'mention', attrs: { id: mentioned, label: 'P' } }] : []),
                  { type: 'text', text: ' looks good' },
                ],
              },
            ],
          },
          bodyText: 'looks good',
          createdAt: new Date(at),
        });
        const replyAt = at + lognormal(3 * HOUR);
        if (mentioned && chance(0.8) && replyAt < nowMs) {
          commentRows.push({
            taskId,
            authorId: mentioned,
            body: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'on it' }] }],
            },
            bodyText: 'on it',
            createdAt: new Date(replyAt),
          });
        }
      }
      if (completedAt !== null && chance(0.4)) {
        activityRows.push({
          workspaceId,
          projectId: project.id,
          taskId,
          actorId: pick(team),
          type: 'subtask.completed',
          payload: { subtask: { id: uuidv7(), title: 'QA' } },
          createdAt: new Date(createdAt + rand() * (completedAt - createdAt)),
        });
      }
    }

    await insertChunks(taskRows, (c) => tx.insert(tasks).values(c));
    await insertChunks(assigneeRows, (c) => tx.insert(taskAssignees).values(c));
    await insertChunks(periodRows, (c) => tx.insert(taskStatusPeriods).values(c));
    await insertChunks(membershipRows, (c) => tx.insert(sprintMemberships).values(c));
    await insertChunks(commentRows, (c) => tx.insert(comments).values(c));
    await insertChunks(activityRows, (c) => tx.insert(activity).values(c));
    for (const [projectId, taskSeq] of seq) {
      await tx.update(projects).set({ taskSeq }).where(eq(projects.id, projectId));
    }
    console.log(
      `Generated ${taskRows.length} tasks, ${periodRows.length} status periods, ${membershipRows.length} sprint memberships, ${commentRows.length} comments, ${activityRows.length} activity rows.`,
    );
  });
  await database.execute(sql`analyze`);
}

/**
 * Tags, subtasks and attachments for the list view's per-row aggregates. Added separately (and
 * only once) so existing Perf data doesn't need a rebuild.
 */
async function ensureListData(database: Db, workspaceId: string) {
  const [hasTags] = await database
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId))
    .limit(1);
  if (hasTags) return;
  const rows = await database
    .select({ id: tasks.id, createdBy: tasks.createdBy })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(projects.workspaceId, workspaceId));
  const tagRows = ['Frontend', 'Backend', 'iOS', 'Android', 'UX/UI', 'Research', 'Bug', 'Docs'].map(
    (name) => ({
      id: uuidv7(),
      workspaceId,
      name,
      color: pick(['blue', 'violet', 'teal', 'neutral'] as const),
    }),
  );
  const taskTagRows: (typeof taskTags.$inferInsert)[] = [];
  const subtaskRows: (typeof subtasks.$inferInsert)[] = [];
  const attachmentRows: (typeof attachments.$inferInsert)[] = [];
  for (const task of rows) {
    if (chance(0.4)) {
      const chosen = new Set([pick(tagRows).id, ...(chance(0.4) ? [pick(tagRows).id] : [])]);
      for (const tagId of chosen) taskTagRows.push({ taskId: task.id, tagId });
    }
    if (chance(0.4)) {
      let position: string | null = null;
      const n = 1 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        position = positionAfter(position);
        subtaskRows.push({ taskId: task.id, title: `Step ${i + 1}`, done: chance(0.5), position });
      }
    }
    if (chance(0.1)) {
      attachmentRows.push({
        taskId: task.id,
        uploaderId: task.createdBy,
        filename: 'spec.pdf',
        mime: 'application/pdf',
        size: 1000 + Math.floor(rand() * 100_000),
        storageKey: `${workspaceId}/${task.id}/${uuidv7()}`,
      });
    }
  }
  await database.transaction(async (tx) => {
    await tx.insert(tags).values(tagRows);
    await insertChunks(taskTagRows, (c) => tx.insert(taskTags).values(c));
    await insertChunks(subtaskRows, (c) => tx.insert(subtasks).values(c));
    await insertChunks(attachmentRows, (c) => tx.insert(attachments).values(c));
  });
  await database.execute(sql`analyze`);
  console.log(
    `Added ${taskTagRows.length} task tags, ${subtaskRows.length} subtasks, ${attachmentRows.length} attachments.`,
  );
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

async function main() {
  if (args.has('--drop') || args.has('--fresh')) {
    await dropPerf(db);
    console.log('Dropped the Perf workspace.');
    if (args.has('--drop')) return;
  }
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, SLUG));
  if (!existing) await generate(db);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, SLUG));
  if (!ws) throw new Error('Perf workspace missing');
  await ensureListData(db, ws.id);

  const app = await buildApp({ ...config, NODE_ENV: 'test', REPORTS_CACHE_TTL_MS: 0 }, db);
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: new URL(config.WEB_ORIGIN).origin },
    payload: { email: 'perf-1@kite.test', password: PASSWORD },
  });
  const cookie = String(login.headers['set-cookie'] ?? '');
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, ws.id))
    .limit(1);
  const [member] = await db.select().from(users).where(eq(users.email, 'perf-10@kite.test'));
  if (!project || !member) throw new Error('Perf data incomplete');

  const endpoints: Record<string, string> = {
    'overview (workspace)': 'overview',
    'overview (quarter)': 'overview?period=quarter',
    'overview (project)': `overview?projectId=${project.id}`,
    sprints: `sprints?projectId=${project.id}`,
    workload: 'workload',
    'people (owner)': 'people/me',
    'people (member)': `people/${member.id}`,
  };
  /** Median request time of `url`, printed as one line. */
  const time = async (name: string, url: string) => {
    const warm = await app.inject({ method: 'GET', url, headers: { cookie } });
    if (warm.statusCode !== 200) throw new Error(`${name}: ${warm.statusCode} ${warm.body}`);
    const ms: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      await app.inject({ method: 'GET', url, headers: { cookie } });
      ms.push(performance.now() - start);
    }
    const m = median(ms);
    const rows = Array.isArray(warm.json()) ? ` · ${warm.json<unknown[]>().length} rows` : '';
    console.log(
      `  ${name.padEnd(28)} ${m.toFixed(0).padStart(5)} ms ${m < TARGET_MS ? '✓' : '✗'}${rows}`,
    );
    return m;
  };

  const timings: [string, number][] = [];
  console.log(`\nReport endpoints, uncached, median of ${RUNS} (target < ${TARGET_MS} ms):`);
  for (const [name, path] of Object.entries(endpoints)) {
    timings.push([name, await time(name, `/api/v1/workspaces/${ws.id}/reports/${path}`)]);
  }

  await taskListPerf(ws.id, project, time);

  // EXPLAIN the queries of the slowest report and print the plan of the slowest one.
  const [owner] = await db.select().from(users).where(eq(users.email, 'perf-1@kite.test'));
  if (!owner) throw new Error('no owner');
  const now = new Date();
  const ctx: ReportContext = {
    user: owner,
    role: 'owner',
    workspaceId: ws.id,
    spaceId: null,
    projectId: null,
    timezone: owner.timezone,
    today: todayInZone(owner.timezone, now),
    now,
  };
  const slowest = [...timings].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const b = periodBounds(ctx, { period: slowest.includes('quarter') ? 'quarter' : '4w' });
  let queries: Record<string, SQL | null>;
  if (slowest.startsWith('people')) {
    queries = personQueries(ctx, b, slowest.includes('member') ? member.id : owner.id);
  } else if (slowest === 'workload') {
    const { weekEnd: _, ...q } = workloadQueries(ctx);
    queries = q;
  } else if (slowest === 'sprints') {
    const pctx = { ...ctx, projectId: project.id };
    const prepared = await sprintQueries(
      db,
      pctx,
      await planSprints(db, pctx, project.id, undefined),
    );
    queries = prepared?.queries ?? {};
  } else {
    queries = overviewQueries(
      slowest.includes('project') ? { ...ctx, projectId: project.id } : ctx,
      b,
    );
  }
  let worst: { name: string; ms: number; plan: string } | null = null;
  for (const [name, query] of Object.entries(queries)) {
    if (!query) continue;
    const result = await db.execute<{ 'QUERY PLAN': string }>(
      sql`explain (analyze, buffers) ${query}`,
    );
    const plan = result.rows.map((r) => r['QUERY PLAN']).join('\n');
    const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? 0);
    console.log(`  ${slowest} · ${name}: ${ms.toFixed(1)} ms`);
    if (!worst || ms > worst.ms) worst = { name, ms, plan };
  }
  if (worst)
    console.log(`\nEXPLAIN (ANALYZE, BUFFERS) · ${slowest} · ${worst.name}\n${worst.plan}`);
  await app.close();
}

/** List view and My Tasks: endpoint timings, then EXPLAIN ANALYZE of each list query. */
async function taskListPerf(
  workspaceId: string,
  project: typeof projects.$inferSelect,
  time: (name: string, url: string) => Promise<number>,
) {
  const [assignee] = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)))
    .limit(1);
  const someone = assignee?.userId ?? '';
  const p = `/api/v1/projects/${project.id}/tasks`;
  const s = `/api/v1/spaces/${project.spaceId}/tasks`;
  console.log(`\nTask list endpoints, median of ${RUNS} (target < ${TARGET_MS} ms):`);
  // The List and Board load open tasks plus the last 14 days of done; "Show all" loads everything.
  const recent = addDays(todayInZone(TZ), -13);
  await time('project list', p);
  await time('project list, recent done', `${p}?doneSince=${recent}`);
  await time('project list, open only', `${p}?includeDone=false`);
  await time('project list by due date', `${p}?sort=dueDate`);
  await time('project list, one assignee', `${p}?assigneeId=${someone}`);
  await time('project list, search', `${p}?q=task`);
  await time('space list', s);
  await time('space list, open only', `${s}?includeDone=false`);
  await time('my tasks (owner)', `/api/v1/me/home?workspaceId=${workspaceId}`);

  const base = { sort: 'position', dir: 'asc', includeDone: true } as const;
  const variants: Record<string, { getSQL: () => SQL }> = {
    'project list': projectTaskListQuery(db, project.id, base, TZ, null),
    'project list, recent done': projectTaskListQuery(
      db,
      project.id,
      { ...base, doneSince: recent },
      TZ,
      null,
    ),
    'project list, open only': projectTaskListQuery(
      db,
      project.id,
      { ...base, includeDone: false },
      TZ,
      null,
    ),
    'project list by due date': projectTaskListQuery(
      db,
      project.id,
      { ...base, sort: 'dueDate' },
      TZ,
      null,
    ),
    'project list, one assignee': projectTaskListQuery(
      db,
      project.id,
      { ...base, assigneeId: [someone] },
      TZ,
      null,
    ),
    'space list': spaceTaskListQuery(db, project.spaceId, base, TZ, null),
  };
  let worst: { name: string; ms: number; plan: string } | null = null;
  for (const [name, query] of Object.entries(variants)) {
    const result = await db.execute<{ 'QUERY PLAN': string }>(
      sql`explain (analyze, buffers) ${query.getSQL()}`,
    );
    const plan = result.rows.map((r) => r['QUERY PLAN']).join('\n');
    const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? 0);
    const seqScans = [...plan.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1]);
    console.log(
      `  ${name}: ${ms.toFixed(1)} ms${seqScans.length ? ` · seq scans: ${[...new Set(seqScans)].join(', ')}` : ''}`,
    );
    if (!worst || ms > worst.ms) worst = { name, ms, plan };
  }
  if (worst) console.log(`\nEXPLAIN (ANALYZE, BUFFERS) · ${worst.name}\n${worst.plan}`);
}

try {
  await main();
} finally {
  await pool.end();
}
