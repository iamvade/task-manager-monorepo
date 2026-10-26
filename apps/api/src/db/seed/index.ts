import {
  DEFAULT_STATUS_CATEGORIES,
  addDays,
  addWorkingDays,
  richTextToPlain,
  startOfWeek,
  shortName,
  type ActivityType,
  type Locale,
  type NotificationType,
  type RichTextNode,
  type StatusCategory,
} from '@kite/shared';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import type { Db } from '../client.js';
import * as schema from '../schema/index.js';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../holidays.js';
import {
  ADDED_MID_SPRINT,
  ATTACHMENTS,
  CARRIED_OVER,
  DESCRIPTIONS,
  PROJECT_BRIEFS,
  EVENTS,
  ME,
  PASSWORD,
  PEOPLE,
  PLATFORM_ADMIN,
  PROJECTS,
  REVIEWERS,
  SPACES,
  SPRINTS,
  STATUS_SINCE,
  TAGS,
  TASKS,
  WORKSPACE,
  type CommentPart,
  type EventDef,
  type PersonRef,
  type ProjectRef,
  type TaskDef,
  type Text,
} from './data.js';
import { createClock, type Clock } from './dates.js';
import { buildHistory, planSprints, ubAt } from './history.js';
import { buildStandups } from './standups.js';
import { buildFeedback } from './feedback.js';
import { buildLabs } from './labs.js';
import { backfillReferences } from '../../tasks/references.js';

export interface SeedOptions {
  /** Language for user content that the designs have in both languages. */
  lang: Locale;
  /** Pin "today" (`YYYY-MM-DD`); defaults to the current date in Asia/Ulaanbaatar. */
  today?: string;
}

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];
type StatusRow = Row<typeof schema.statuses> & { id: string };

const entries = <K extends string, V>(record: Record<K, V>) => Object.entries(record) as [K, V][];

/** Fractional-index keys for `n` items in order. */
const positions = (n: number) => generateNKeysBetween(null, null, n);

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/**
 * Projects with generated history (history.ts; their generated keys aren't drawn in the
 * designs): the first ones over all 24 weeks (they're created before it), the newer ones since
 * they were created.
 */
const HISTORY_PROJECTS: readonly ProjectRef[] = ['app', 'platform', 'mobile', 'bugs', 'ds'];
const NEWER_HISTORY_PROJECTS: readonly ProjectRef[] = ['checkout', 'q4'];
/** App Redesign history takes APP-1…120; the drawn tasks start at APP-121. */
const APP_HISTORY_CAP = 120;

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed data error: unknown ${what}`);
  return value;
}

/**
 * Recreates the sample data from the designs in one transaction: workspace "Kite Studio", its
 * people, spaces, projects and tasks. Refuses to run twice; use `pnpm db:reset` to start over.
 */
export async function runSeed(db: Db, options: SeedOptions): Promise<void> {
  const existing = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, WORKSPACE.slug),
  });
  if (existing) {
    throw new Error(`Workspace "${WORKSPACE.slug}" already exists. Run \`pnpm db:reset\` instead.`);
  }

  const clock = createClock(options.today);
  const pick = (text: Text) =>
    typeof text === 'string' ? text : text[options.lang === 'mn' ? 0 : 1];
  const passwordHash = await argon2.hash(PASSWORD);
  const rows = buildRows(clock, pick, passwordHash, options.lang);

  // One transaction: the deferred status-period / sprint-membership checks run at commit.
  await db.transaction(async (tx) => {
    const insert = async <T extends Parameters<typeof tx.insert>[0]>(
      table: T,
      values: T['$inferInsert'][],
    ) => {
      for (let i = 0; i < values.length; i += 1000) {
        await tx.insert(table).values(values.slice(i, i + 1000));
      }
    };
    await tx.insert(schema.users).values(rows.users);
    await tx.insert(schema.users).values({
      ...PLATFORM_ADMIN,
      avatarColor: 'neutral',
      passwordHash,
      locale: options.lang,
      platformRole: 'vade',
    });
    await tx.insert(schema.workspaces).values(rows.workspace);
    await tx.insert(schema.workspaceMembers).values(rows.members);
    await tx.insert(schema.workspaceHolidays).values(rows.holidays);
    await tx.insert(schema.spaces).values(rows.spaces);
    await tx.insert(schema.projects).values(rows.projects);
    await tx.insert(schema.projectMembers).values(rows.projectMembers);
    await tx.insert(schema.statuses).values(rows.statuses);
    await tx.insert(schema.sprints).values(rows.sprints);
    await tx.insert(schema.sprintProjects).values(rows.sprintProjects);
    await tx.insert(schema.tags).values(rows.tags);
    await insert(schema.tasks, rows.tasks);
    await insert(schema.taskStatusPeriods, rows.periods);
    await insert(schema.sprintMemberships, rows.memberships);
    await insert(schema.taskAssignees, rows.assignees);
    await tx.insert(schema.taskTags).values(rows.taskTags);
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
    await tx.insert(schema.attachments).values(rows.attachments);
    await insert(schema.activity, rows.activity);
    // "Mentioned in": keys written in the seeded titles, descriptions and comments.
    await backfillReferences(tx);
    await tx.insert(schema.notifications).values(rows.notifications);
    await tx.insert(schema.userAbsences).values(rows.absences);
    await tx.insert(schema.standupGroups).values(rows.standupGroups);
    await tx.insert(schema.standupGroupMembers).values(rows.standupGroupMembers);
    await tx.insert(schema.standupEntries).values(rows.standupEntries);
    await tx.insert(schema.standupBlockers).values(rows.standupBlockers);
    await tx.insert(schema.standupReactions).values(rows.standupReactions);
    await tx.insert(schema.standupReplies).values(rows.standupReplies);
    await tx.insert(schema.feedback).values(rows.feedback);
    await tx.insert(schema.feedbackAttachments).values(rows.feedbackAttachments);
    await tx.insert(schema.feedbackActivity).values(rows.feedbackActivity);

    const { labs } = rows;
    await tx.insert(schema.workspaces).values(labs.workspace);
    await tx.insert(schema.workspaceMembers).values(labs.members);
    await tx.insert(schema.workspaceHolidays).values(labs.holidays);
    await tx.insert(schema.spaces).values(labs.spaces);
    await tx.insert(schema.projects).values(labs.projects);
    await tx.insert(schema.projectMembers).values(labs.projectMembers);
    await tx.insert(schema.statuses).values(labs.statuses);
    await tx.insert(schema.tasks).values(labs.tasks);
    await tx.insert(schema.taskStatusPeriods).values(labs.periods);
    await tx.insert(schema.taskAssignees).values(labs.assignees);
    await tx.insert(schema.taskFollowers).values(labs.followers);
    await tx.insert(schema.activity).values(labs.activity);
    await tx.insert(schema.notifications).values(labs.notifications);
  });

  console.log(
    `Seeded "${WORKSPACE.name}" (${options.lang}, today ${clock.today}): ` +
      `${rows.users.length} users, ${rows.projects.length} projects, ${rows.tasks.length} tasks, ` +
      `${rows.comments.length} comments, ${rows.activity.length} activity, ` +
      `${rows.periods.length} status periods, ${rows.sprints.length} sprints, ` +
      `${rows.notifications.length} notifications; "${rows.labs.workspace.name}" (Bat, Anu, Dorj). ` +
      `Log in as ${PEOPLE[ME].email} / ${PASSWORD}.`,
  );
}

/** Every seed row, built in memory (exported for tests). */
/** The project's brief as rows (`PROJECT_BRIEFS`), in the seed's language. */
const briefRow = (pick: (text: Text) => string, ref: string) => {
  const brief = PROJECT_BRIEFS[ref];
  if (!brief) return {};
  const text = pick(brief);
  return {
    description: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    descriptionText: text,
  };
};

export function buildRows(
  clock: Clock,
  pick: (text: Text) => string,
  passwordHash: string,
  lang: Locale,
) {
  const workspaceId = uuidv7();
  const holidays = MN_PUBLIC_HOLIDAYS_2026.map((h) => ({ workspaceId, ...h }));
  const holidayDates = new Set(holidays.map((h) => h.date));
  // History covers the last 24 weeks; accounts and the projects with history predate it.
  const historyStart = ubAt(addDays(startOfWeek(clock.today), -23 * 7), 0);
  const accountsCreated = new Date(
    Math.min(clock.at([7, 1, '09:00']).getTime(), historyStart.getTime() - 30 * DAY_MS),
  );

  // People ------------------------------------------------------------------------------------
  const users = entries(PEOPLE).map(([ref, p]) => ({
    ref,
    row: {
      id: uuidv7(),
      email: p.email,
      name: pick(p.name),
      initials: pick(p.initials),
      avatarColor: p.avatarColor,
      passwordHash,
      locale: lang,
      createdAt: accountsCreated,
    } satisfies Row<typeof schema.users>,
  }));
  const userByRef = new Map(users.map((u) => [u.ref, u.row]));
  const user = (ref: PersonRef) => must(userByRef.get(ref), `person ${ref}`);
  const mention = (ref: PersonRef): RichTextNode => ({
    type: 'mention',
    attrs: { id: user(ref).id, label: shortName(user(ref).name) },
  });

  const members = entries(PEOPLE).map(([ref, p]) => ({
    workspaceId,
    userId: user(ref).id,
    role: p.role,
    title: p.title,
    capacityPoints: p.capacity,
    joinedAt: accountsCreated,
  }));

  // Spaces, projects, statuses, sprint, tags -----------------------------------------------------
  const spaceKeys = positions(Object.keys(SPACES).length);
  const spaces = entries(SPACES).map(([ref, sp], i) => ({
    ref,
    row: {
      id: uuidv7(),
      workspaceId,
      name: pick(sp.name),
      initial: pick(sp.initial),
      color: sp.color,
      position: must(spaceKeys[i], 'space position'),
    } satisfies Row<typeof schema.spaces>,
  }));

  const projectsBySpace = new Map<string, number>();
  const projectList = entries(PROJECTS);
  const projects = projectList.map(([ref, pr]) => {
    const space = must(
      spaces.find((s) => s.ref === pr.space),
      `space ${pr.space}`,
    );
    const index = projectsBySpace.get(pr.space) ?? 0;
    projectsBySpace.set(pr.space, index + 1);
    const siblings = projectList.filter(([, other]) => other.space === pr.space).length;
    return {
      ref,
      def: pr,
      row: {
        id: uuidv7(),
        workspaceId,
        spaceId: space.row.id,
        name: pick(pr.name),
        key: pr.key,
        color: pr.color,
        taskSeq: 0,
        position: must(positions(siblings)[index], 'project position'),
        ...briefRow(pick, ref),
        createdAt: HISTORY_PROJECTS.includes(ref)
          ? new Date(historyStart.getTime() - 21 * DAY_MS)
          : clock.at(pr.createdAt),
      } satisfies Row<typeof schema.projects>,
    };
  });
  const projectByRef = new Map(projects.map((p) => [p.ref, p]));
  const project = (ref: ProjectRef) => must(projectByRef.get(ref), `project ${ref}`);

  const projectMembers = projects.flatMap((p) =>
    p.def.members.map((ref) => ({ projectId: p.row.id, userId: user(ref).id })),
  );

  const statusKeys = positions(DEFAULT_STATUS_CATEGORIES.length);
  const statuses: StatusRow[] = projects.flatMap((p) =>
    DEFAULT_STATUS_CATEGORIES.map((category, i) => ({
      id: uuidv7(),
      projectId: p.row.id,
      name: null,
      category,
      color: null,
      position: must(statusKeys[i], 'status position'),
    })),
  );
  const status = (projectRef: ProjectRef, category: StatusCategory) =>
    must(
      statuses.find((s) => s.projectId === project(projectRef).row.id && s.category === category),
      `status ${projectRef}/${category}`,
    );
  const statusSnapshot = (row: StatusRow) => ({
    id: row.id,
    name: row.name ?? null,
    category: row.category,
  });

  // Product Sprints 9–14 (unnamed: "Sprint 14"); today is day 4 of the current one.
  const sprintWindows = planSprints(clock.today, holidayDates, SPRINTS).map((w) => ({
    ...w,
    id: uuidv7(),
  }));
  const sprints = sprintWindows.map(
    (w) =>
      ({
        id: w.id,
        workspaceId,
        number: w.number,
        name: null,
        startDate: w.start,
        endDate: w.end,
        createdBy: user(project(SPRINTS.project).def.lead).id,
      }) satisfies Row<typeof schema.sprints>,
  );
  const sprintProjects = sprintWindows.flatMap((w) =>
    SPRINTS.projects.map(
      (ref) =>
        ({ sprintId: w.id, projectId: project(ref).row.id }) satisfies Row<
          typeof schema.sprintProjects
        >,
    ),
  );
  const sprintWindow = (n: number) =>
    must(
      sprintWindows.find((w) => w.number === n),
      `sprint ${String(n)}`,
    );
  const currentSprint = sprintWindow(SPRINTS.current);

  const tags = entries(TAGS).map(([ref, t]) => ({
    ref,
    row: { id: uuidv7(), workspaceId, name: pick(t.name), color: t.color } satisfies Row<
      typeof schema.tags
    >,
  }));
  const tagByRef = new Map(tags.map((t) => [t.ref, t.row]));

  // Tasks -------------------------------------------------------------------------------------
  const todayStart = new Date(clock.startOfYesterday.getTime() + 86_400_000);
  const completedAt = (def: TaskDef) => {
    if (!def.completedAt) return null;
    if (def.completedAt !== 'today') return clock.at(def.completedAt);
    // "Earlier today": 11:30, or a few minutes ago when the seed runs before that.
    const late = Math.min(clock.at([10, 8, '11:30']).getTime(), clock.now.getTime() - 10 * 60_000);
    return new Date(Math.max(late, todayStart.getTime() + 60_000));
  };

  const nextNumber = new Map<ProjectRef, number>();
  const columnSizes = new Map<string, number>();
  for (const def of TASKS) {
    const column = `${def.project}/${def.status}`;
    columnSizes.set(column, (columnSizes.get(column) ?? 0) + 1);
  }
  const columnKeys = new Map([...columnSizes].map(([column, n]) => [column, positions(n)]));
  const columnIndex = new Map<string, number>();

  const tasks = TASKS.map((def) => {
    const p = project(def.project);
    const number = def.number ?? (nextNumber.get(def.project) ?? 0) + 1;
    nextNumber.set(def.project, Math.max(number, nextNumber.get(def.project) ?? 0));
    p.row.taskSeq = Math.max(p.row.taskSeq, number);

    const column = `${def.project}/${def.status}`;
    const index = columnIndex.get(column) ?? 0;
    columnIndex.set(column, index + 1);

    // App Redesign numbers grow by about two a day from Sep 21 (APP-121); other projects' done
    // tasks date from Sep 25 and their open ones from Oct 2 (Reports aging). All precede every
    // due and completion date in the data.
    let createdAt = clock.at(
      def.createdAt ??
        (def.number
          ? [9, 21 + Math.floor((def.number - 121) / 2), '10:00']
          : def.completedAt
            ? [9, 25, '10:00']
            : [10, 2, '10:00']),
    );
    // Sprint 14 tasks committed at planning existed before it; carried-over ones before the
    // first sprint that left them unfinished.
    if (def.sprint && !ADDED_MID_SPRINT[def.ref]) {
      const carried = CARRIED_OVER[def.ref] ?? 0;
      const planning = sprintWindow(SPRINTS.current - carried).planningAt;
      if (createdAt >= planning) {
        createdAt = new Date(planning.getTime() - (carried ? 2 * DAY_MS : HOUR_MS));
      }
    }
    const reviewer = REVIEWERS[def.ref] ?? (def.status === 'review' ? p.def.lead : undefined);
    const description = DESCRIPTIONS[def.ref]?.(mention) ?? null;
    return {
      def,
      row: {
        id: uuidv7(),
        projectId: p.row.id,
        number,
        statusId: status(def.project, def.status).id,
        sprintId: def.sprint ? currentSprint.id : null,
        title: pick(def.title),
        description,
        descriptionText: description ? richTextToPlain(description) : '',
        priority: def.priority,
        size: def.size ?? null,
        reviewerId: reviewer ? user(reviewer).id : null,
        startDate: def.start ? clock.day(def.start) : null,
        dueDate: def.due ? clock.day(def.due) : null,
        position: must(columnKeys.get(column)?.[index], 'task position'),
        createdBy: user(def.createdBy ?? p.def.lead).id,
        completedAt: completedAt(def),
        closedAt: completedAt(def),
        createdAt,
        updatedAt: createdAt,
      } satisfies Row<typeof schema.tasks>,
    };
  });
  const taskByRef = new Map(tasks.map((t) => [t.def.ref, t]));
  const task = (ref: string) => must(taskByRef.get(ref), `task ${ref}`);
  const touch = (ref: string, at: Date) => {
    const row = task(ref).row;
    if (at > row.updatedAt) row.updatedAt = at;
  };

  const assignees = tasks.flatMap((t) =>
    t.def.assignees.map((ref) => ({ taskId: t.row.id, userId: user(ref).id })),
  );
  const taskTags = tasks.flatMap((t) =>
    (t.def.tags ?? []).map((ref) => ({
      taskId: t.row.id,
      tagId: must(tagByRef.get(ref), `tag ${ref}`).id,
    })),
  );

  const followerKeys = new Set<string>();
  const followers: Row<typeof schema.taskFollowers>[] = [];
  const follow = (taskId: string, userId: string) => {
    if (followerKeys.has(`${taskId}/${userId}`)) return;
    followerKeys.add(`${taskId}/${userId}`);
    followers.push({ taskId, userId });
  };
  for (const t of tasks) {
    follow(t.row.id, t.row.createdBy);
    for (const ref of [...t.def.assignees, ...(t.def.followers ?? [])])
      follow(t.row.id, user(ref).id);
  }

  const subtasks = tasks.flatMap((t) => {
    const defs = t.def.subtasks ?? [];
    const keys = positions(defs.length);
    return defs.map((s, i) => ({
      id: uuidv7(),
      taskId: t.row.id,
      title: s.title,
      assigneeId: s.assignee ? user(s.assignee).id : null,
      dueDate: s.due ? clock.day(s.due) : null,
      done: s.done ?? false,
      position: must(keys[i], 'subtask position'),
    }));
  });

  // Activity, comments, notifications ----------------------------------------------------------
  interface ActivityRow extends Row<typeof schema.activity> {
    id: string;
    taskId: string;
    createdAt: Date;
  }
  const activity: ActivityRow[] = [];
  const notifications: Row<typeof schema.notifications>[] = [];
  const log = (
    ref: string,
    actorId: string,
    type: ActivityType,
    at: Date,
    payload: Record<string, unknown> = {},
  ): ActivityRow => {
    const t = task(ref);
    const row = {
      id: uuidv7(),
      workspaceId,
      projectId: t.row.projectId,
      taskId: t.row.id,
      actorId,
      type,
      payload,
      createdAt: at,
    };
    activity.push(row);
    touch(ref, at);
    return row;
  };
  // Anything from before yesterday has been read; yesterday's and today's are still unread.
  const notify = (to: PersonRef, type: NotificationType, act: ActivityRow) => {
    notifications.push({
      userId: user(to).id,
      type,
      taskId: act.taskId,
      actorId: act.actorId,
      activityId: act.id,
      readAt:
        act.createdAt < clock.startOfYesterday
          ? new Date(act.createdAt.getTime() + 3_600_000)
          : null,
      createdAt: act.createdAt,
    });
  };

  // Status periods. Every task starts in To Do. Tasks with drawn status history (EVENTS) follow
  // it; the others moved on at the drawn "days in status" (STATUS_SINCE) or at generated times,
  // kept 2.5+ days back so My Tasks' recent activity stays as designed.
  const periods: Row<typeof schema.taskStatusPeriods>[] = [];
  const recentLimit = clock.now.getTime() - 2.5 * DAY_MS;
  for (const t of tasks) {
    const { def, row } = t;
    const created = row.createdAt.getTime();
    const mover = user(def.assignees[0] ?? def.createdBy ?? project(def.project).def.lead).id;
    const reviewerRef = REVIEWERS[def.ref];
    const reviewerId = reviewerRef ? user(reviewerRef).id : null;
    log(def.ref, row.createdBy, 'task.created', row.createdAt, {
      status: statusSnapshot(status(def.project, 'todo')),
    });

    interface Step {
      category: StatusCategory;
      at: number;
      by: string;
    }
    const steps: Step[] = [{ category: 'todo', at: created, by: row.createdBy }];
    const drawn = EVENTS.filter((e) => e.task === def.ref && e.type === 'status.changed');
    if (drawn.length > 0) {
      // Logged by the EVENTS loop below.
      for (const e of drawn) {
        if (e.type === 'status.changed') {
          steps.push({ category: e.to, at: clock.at(e.at).getTime(), by: user(e.actor).id });
        }
      }
    } else if (row.completedAt) {
      const span = row.completedAt.getTime() - created;
      steps.push({ category: 'in_progress', at: created + span * 0.35, by: mover });
      if (reviewerId) steps.push({ category: 'review', at: created + span * 0.75, by: mover });
      steps.push({ category: 'done', at: row.completedAt.getTime(), by: reviewerId ?? mover });
    } else if (def.status !== 'todo' || STATUS_SINCE[def.ref]) {
      const pinned = STATUS_SINCE[def.ref];
      const low = created + HOUR_MS;
      const high = created < recentLimit ? recentLimit : clock.now.getTime() - HOUR_MS;
      const since = pinned
        ? clock.at(pinned).getTime()
        : low + stableFraction(def.ref) * Math.max(0, high - low);
      // Review came from In Progress; a pinned To Do went back from it.
      if (def.status === 'review' || def.status === 'todo') {
        steps.push({ category: 'in_progress', at: created + (since - created) * 0.5, by: mover });
      }
      steps.push({ category: def.status, at: since, by: mover });
    }
    if (steps.at(-1)?.category !== def.status) {
      throw new Error(`Seed data error: ${def.ref} history doesn't end in ${def.status}`);
    }
    steps.forEach((step, i) => {
      const next = steps[i + 1];
      const previous = steps[i - 1];
      if (i > 0 && step.at <= (previous?.at ?? 0)) {
        throw new Error(`Seed data error: ${def.ref} status history is out of order`);
      }
      periods.push({
        taskId: row.id,
        statusId: status(def.project, step.category).id,
        category: step.category,
        enteredAt: new Date(step.at),
        exitedAt: next ? new Date(next.at) : null,
        enteredBy: step.by,
        exitedBy: next?.by ?? null,
      });
      if (previous && drawn.length === 0) {
        log(def.ref, step.by, 'status.changed', new Date(step.at), {
          from: statusSnapshot(status(def.project, previous.category)),
          to: statusSnapshot(status(def.project, step.category)),
        });
      }
    });
  }

  // Sprint 14 scope: committed at planning (carried-over tasks through the earlier sprints that
  // left them unfinished), a few added mid-sprint (ReportsSprints.dc.html).
  const memberships: Row<typeof schema.sprintMemberships>[] = [];
  const planner = user(project(SPRINTS.project).def.lead).id;
  for (const t of tasks.filter((x) => x.def.sprint)) {
    const carried = CARRIED_OVER[t.def.ref] ?? 0;
    const addedDay = ADDED_MID_SPRINT[t.def.ref];
    const chain = Array.from({ length: carried + 1 }, (_, i) =>
      sprintWindow(SPRINTS.current - carried + i),
    );
    let from: { id: string; name: null; number: number } | null = null;
    chain.forEach((w, i) => {
      const next = chain[i + 1];
      let addedAt = w.planningAt;
      if (!next && addedDay) {
        const day = addWorkingDays(w.start, addedDay - 1, holidayDates);
        addedAt = new Date(
          Math.max(
            Math.min(ubAt(day, 11 * 60).getTime(), clock.now.getTime() - 15 * 60_000),
            t.row.createdAt.getTime() + 60_000,
          ),
        );
      }
      memberships.push({
        taskId: t.row.id,
        sprintId: w.id,
        addedAt,
        removedAt: next ? next.planningAt : null,
        addedBy: planner,
        removedBy: next ? planner : null,
      });
      const to = { id: w.id, name: null, number: w.number };
      log(t.def.ref, planner, 'sprint.changed', addedAt, { from, to });
      from = to;
    });
  }

  const comments: (Row<typeof schema.comments> & { id: string })[] = [];
  for (const t of tasks) {
    const refs = new Map<string, string>();
    for (const c of t.def.comments ?? []) {
      const at = clock.at(c.at);
      const body: RichTextNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: c.body.map((part) => commentNode(part, mention)) }],
      };
      const row = {
        id: uuidv7(),
        taskId: t.row.id,
        authorId: user(c.author).id,
        parentId: c.replyTo ? must(refs.get(c.replyTo), `comment ${c.replyTo}`) : null,
        body,
        bodyText: richTextToPlain(body),
        createdAt: at,
      };
      if (c.ref) refs.set(c.ref, row.id);
      comments.push(row);
      follow(t.row.id, row.authorId);

      const act = log(t.def.ref, row.authorId, 'comment.added', at, { commentId: row.id });
      const mentioned = c.body.flatMap((part) => (typeof part === 'string' ? [] : [part.mention]));
      for (const ref of new Set(mentioned)) if (ref !== c.author) notify(ref, 'mention', act);
      for (const ref of c.notify ?? []) notify(ref, 'comment', act);
    }
  }

  const attachments = ATTACHMENTS.map((a) => {
    const t = task(a.task);
    const id = uuidv7();
    touch(a.task, clock.at(a.at));
    return {
      id,
      taskId: t.row.id,
      uploaderId: user(a.uploader).id,
      filename: a.filename,
      mime: a.mime,
      size: a.size,
      // Same key shape as uploads; no file exists, so downloads answer 404 FILE_MISSING.
      storageKey: `${workspaceId}/${t.row.id}/${id}`,
      createdAt: clock.at(a.at),
    } satisfies Row<typeof schema.attachments>;
  });

  for (const e of EVENTS) {
    const act = log(e.task, user(e.actor).id, e.type, clock.at(e.at), eventPayload(e));
    for (const ref of e.notify ?? [])
      notify(ref, e.type === 'assignee.added' ? 'assigned' : 'status', act);
  }

  function eventPayload(e: EventDef): Record<string, unknown> {
    const t = task(e.task);
    switch (e.type) {
      case 'status.changed':
        return {
          from: statusSnapshot(status(t.def.project, e.from)),
          to: statusSnapshot(status(t.def.project, e.to)),
        };
      case 'priority.changed':
        return { from: e.from, to: e.to };
      case 'due.changed':
        return { from: clock.day(e.from), to: clock.day(e.to) };
      case 'assignee.added':
        return { user: { id: user(e.user).id, name: user(e.user).name } };
      case 'attachment.added': {
        const a = must(
          attachments.find((x) => x.taskId === t.row.id && x.filename === e.filename),
          `attachment ${e.filename}`,
        );
        return { attachment: { id: a.id, filename: a.filename } };
      }
      case 'subtask.completed': {
        const s = must(
          subtasks.find((x) => x.taskId === t.row.id && x.title === e.subtask),
          `subtask ${e.subtask}`,
        );
        return { subtask: { id: s.id, title: s.title } };
      }
    }
  }

  // Generated history (history.ts): ~24 weeks of completed tasks for Reports.
  const appHistoryFrom = sprintWindow(SPRINTS.first).planningAt;
  const history = buildHistory({
    clock,
    holidays: holidayDates,
    workspaceId,
    pick,
    userId: (ref) => user(ref).id,
    userName: (ref) => user(ref).name,
    mention,
    projects: [...HISTORY_PROJECTS, ...NEWER_HISTORY_PROJECTS].map((ref) => ({
      ref,
      id: project(ref).row.id,
      members: project(ref).def.members,
      product: project(ref).def.space === 'product',
      cap: ref === 'app' ? APP_HISTORY_CAP : Number.POSITIVE_INFINITY,
      // App Redesign history spreads over its sprints (from Sprint 9 planning).
      ...(NEWER_HISTORY_PROJECTS.includes(ref) && {
        from: new Date(project(ref).row.createdAt.getTime() + 2 * DAY_MS),
      }),
      ...(ref === 'app' && {
        from: appHistoryFrom,
        perWeek: Math.ceil(
          APP_HISTORY_CAP /
            ((clock.at([10, 1, '00:00']).getTime() - appHistoryFrom.getTime()) / (7 * DAY_MS)),
        ),
      }),
      status: (category) => status(ref, category),
    })),
    sprints: sprintWindows.filter((w) => w.number < SPRINTS.current),
    sprintProject: SPRINTS.project,
    sprintOwner: project(SPRINTS.project).def.lead,
    existingCompletions: tasks.flatMap((t) => (t.row.completedAt ? [t.row.completedAt] : [])),
    me: ME,
    // My Tasks (this week and last week) and the shown Calendar month stay as designed.
    meCutoff: ubAt(addDays(startOfWeek(clock.today), -7), 0),
    productCutoff: clock.at([10, 1, '00:00']),
  });
  // History takes the lowest numbers (APP-1…120; the drawn App Redesign keys start at 121) and
  // sits after the drawn tasks in each Done column, newest first.
  for (const ref of [...HISTORY_PROJECTS, ...NEWER_HISTORY_PROJECTS]) {
    const p = project(ref);
    const own = history.tasks
      .filter((h) => h.projectRef === ref)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (ref === 'app' && own.length > APP_HISTORY_CAP) throw new Error('Too much APP history');
    own.forEach((h, i) => {
      h.number = i + 1;
    });
    if (ref !== 'app') {
      for (const t of tasks) if (t.def.project === ref) t.row.number += own.length;
    }
    p.row.taskSeq = Math.max(
      own.length,
      ...tasks.filter((t) => t.def.project === ref).map((t) => t.row.number),
    );
    const doneKeys = columnKeys.get(`${ref}/done`) ?? [];
    const newestFirst = [...own].reverse();
    const keys = generateNKeysBetween(doneKeys.at(-1) ?? null, null, newestFirst.length);
    newestFirst.forEach((h, i) => {
      h.position = must(keys[i], 'history position');
    });
  }

  const standups = buildStandups({ clock, pick, workspaceId, user, task });
  const projectKeyById = new Map(projects.map((p) => [p.row.id, p.row.key]));
  const { feedbackSeq, ...feedbackRows } = buildFeedback({
    clock,
    pick,
    workspaceId,
    user,
    task,
    projectKey: (id) => must(projectKeyById.get(id), `project ${id}`),
  });

  return {
    holidays,
    ...standups,
    ...feedbackRows,
    periods: [...periods, ...history.periods],
    memberships: [...memberships, ...history.memberships],
    users: users.map((u) => u.row),
    workspace: {
      id: workspaceId,
      name: WORKSPACE.name,
      slug: WORKSPACE.slug,
      feedbackSeq,
      createdAt: accountsCreated,
    },
    members,
    spaces: spaces.map((s) => s.row),
    projects: projects.map((p) => p.row),
    projectMembers,
    statuses,
    sprints,
    sprintProjects,
    tags: tags.map((t) => t.row),
    tasks: [...tasks.map((t) => t.row), ...history.tasks.map(({ projectRef: _, ...row }) => row)],
    assignees: [...assignees, ...history.assignees],
    taskTags,
    followers: [...followers, ...history.followers],
    subtasks: [...subtasks, ...history.subtasks],
    comments: [...comments, ...history.comments],
    attachments,
    activity: [...activity, ...history.activity],
    notifications,
    // Joined two weeks ago, after Kite Studio (so Studio stays everyone's first workspace).
    labs: buildLabs(
      clock,
      pick,
      (ref) => user(ref).id,
      new Date(clock.now.getTime() - 14 * DAY_MS),
    ),
  };
}

function commentNode(part: CommentPart, mention: (ref: PersonRef) => RichTextNode): RichTextNode {
  return typeof part === 'string' ? { type: 'text', text: part } : mention(part.mention);
}

/** A stable 0–1 value per key (generated times that don't change between runs). */
function stableFraction(key: string): number {
  let hash = 2_166_136_261;
  for (const ch of key) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}
