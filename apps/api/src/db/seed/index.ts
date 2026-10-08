import {
  DEFAULT_STATUS_CATEGORIES,
  richTextToPlain,
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
import {
  ATTACHMENTS,
  DESCRIPTIONS,
  EVENTS,
  ME,
  PASSWORD,
  PEOPLE,
  PROJECTS,
  SPACES,
  SPRINT,
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
import { createClock, type Clock, type MonthDay } from './dates.js';

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

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values(rows.users);
    await tx.insert(schema.workspaces).values(rows.workspace);
    await tx.insert(schema.workspaceMembers).values(rows.members);
    await tx.insert(schema.spaces).values(rows.spaces);
    await tx.insert(schema.projects).values(rows.projects);
    await tx.insert(schema.projectMembers).values(rows.projectMembers);
    await tx.insert(schema.statuses).values(rows.statuses);
    await tx.insert(schema.sprints).values(rows.sprints);
    await tx.insert(schema.tags).values(rows.tags);
    await tx.insert(schema.tasks).values(rows.tasks);
    await tx.insert(schema.taskAssignees).values(rows.assignees);
    await tx.insert(schema.taskTags).values(rows.taskTags);
    await tx.insert(schema.taskFollowers).values(rows.followers);
    await tx.insert(schema.subtasks).values(rows.subtasks);
    // Parents first: replies reference them.
    await tx.insert(schema.comments).values(rows.comments.filter((c) => !c.parentId));
    await tx.insert(schema.comments).values(rows.comments.filter((c) => c.parentId));
    await tx.insert(schema.attachments).values(rows.attachments);
    await tx.insert(schema.activity).values(rows.activity);
    await tx.insert(schema.notifications).values(rows.notifications);
  });

  console.log(
    `Seeded "${WORKSPACE.name}" (${options.lang}, today ${clock.today}): ` +
      `${rows.users.length} users, ${rows.projects.length} projects, ${rows.tasks.length} tasks, ` +
      `${rows.comments.length} comments, ${rows.activity.length} activity, ` +
      `${rows.notifications.length} notifications. Log in as ${PEOPLE[ME].email} / ${PASSWORD}.`,
  );
}

function buildRows(clock: Clock, pick: (text: Text) => string, passwordHash: string, lang: Locale) {
  const workspaceId = uuidv7();
  const accountsCreated = clock.at([7, 1, '09:00']);

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
        createdAt: clock.at(pr.createdAt),
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

  const sprint = {
    id: uuidv7(),
    projectId: project(SPRINT.project).row.id,
    name: formatRange(clock.day(SPRINT.start), clock.day(SPRINT.end), lang),
    startDate: clock.day(SPRINT.start),
    endDate: clock.day(SPRINT.end),
  } satisfies Row<typeof schema.sprints>;

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

    // App Redesign numbers grow by about two a day from Sep 21 (APP-121); other projects' tasks
    // date from Sep 25. Both precede every due and completion date in the data.
    const createdAt = clock.at(
      def.createdAt ??
        (def.number ? [9, 21 + Math.floor((def.number - 121) / 2), '10:00'] : [9, 25, '10:00']),
    );
    const description = DESCRIPTIONS[def.ref]?.(mention) ?? null;
    return {
      def,
      row: {
        id: uuidv7(),
        projectId: p.row.id,
        number,
        statusId: status(def.project, def.status).id,
        sprintId: def.sprint ? sprint.id : null,
        title: pick(def.title),
        description,
        descriptionText: description ? richTextToPlain(description) : '',
        priority: def.priority,
        startDate: def.start ? clock.day(def.start) : null,
        dueDate: def.due ? clock.day(def.due) : null,
        position: must(columnKeys.get(column)?.[index], 'task position'),
        createdBy: user(def.createdBy ?? p.def.lead).id,
        completedAt: completedAt(def),
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

  for (const t of tasks) {
    log(t.def.ref, t.row.createdBy, 'task.created', t.row.createdAt, {});
    if (t.row.completedAt) {
      log(
        t.def.ref,
        user(must(t.def.assignees[0], 'completer')).id,
        'status.changed',
        t.row.completedAt,
        {
          from: statusSnapshot(status(t.def.project, 'in_progress')),
          to: statusSnapshot(status(t.def.project, 'done')),
        },
      );
    }
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
      storageKey: `seed/${t.row.id}/${id}/${a.filename}`,
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
        return { attachmentId: a.id, filename: a.filename };
      }
      case 'subtask.completed': {
        const s = must(
          subtasks.find((x) => x.taskId === t.row.id && x.title === e.subtask),
          `subtask ${e.subtask}`,
        );
        return { subtaskId: s.id, title: s.title };
      }
    }
  }

  return {
    users: users.map((u) => u.row),
    workspace: {
      id: workspaceId,
      name: WORKSPACE.name,
      slug: WORKSPACE.slug,
      createdAt: accountsCreated,
    },
    members,
    spaces: spaces.map((s) => s.row),
    projects: projects.map((p) => p.row),
    projectMembers,
    statuses,
    sprints: [sprint],
    tags: tags.map((t) => t.row),
    tasks: tasks.map((t) => t.row),
    assignees,
    taskTags,
    followers,
    subtasks,
    comments,
    attachments,
    activity,
    notifications,
  };
}

function commentNode(part: CommentPart, mention: (ref: PersonRef) => RichTextNode): RichTextNode {
  return typeof part === 'string' ? { type: 'text', text: part } : mention(part.mention);
}

const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Oct 6 – Oct 24" / "10-р сарын 6 – 24", as in the sprint filter chip. */
function formatRange(start: string, end: string, lang: Locale): string {
  const parse = (iso: string): MonthDay => [Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  const [m1, d1] = parse(start);
  const [m2, d2] = parse(end);
  if (lang === 'mn') {
    return m1 === m2 ? `${m1}-р сарын ${d1} – ${d2}` : `${m1}-р сарын ${d1} – ${m2}-р сарын ${d2}`;
  }
  return `${MONTHS_EN[m1 - 1]} ${d1} – ${MONTHS_EN[m2 - 1]} ${d2}`;
}
