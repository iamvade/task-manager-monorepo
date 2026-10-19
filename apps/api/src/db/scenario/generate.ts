import {
  DEFAULT_STATUS_CATEGORIES,
  addDays,
  initialsFor,
  richTextToPlain,
  shortName,
  startOfWeek,
  type ActivityType,
  type Locale,
  type NotificationType,
  type Priority,
  type RichTextNode,
  type Size,
  type StatusCategory,
} from '@kite/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../holidays.js';
import type * as schema from '../schema/index.js';
import { createRng } from './random.js';
import { buildStandups } from './standups.js';
import {
  COMMENTS,
  CRITERIA,
  DESCRIPTION_INTRO,
  FEEDBACK,
  HOT_LINES,
  HOT_TITLES,
  MENTION_ASKS,
  ONBOARDING,
  REPLIES,
  SUBTASKS,
  TITLES,
  TITLE_SUFFIX,
  emailLocalFor,
} from './text.js';
import type { Archetype, PersonDef, ProjectDef, ScenarioDef } from './types.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];
type ActivityRow = Row<typeof schema.activity> & { id: string; taskId: string; createdAt: Date };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Asia/Ulaanbaatar is UTC+8 with no DST. */
const UB_OFFSET = 8 * HOUR;
/** Notifications are generated for the last three weeks (older ones would be read and archived). */
const NOTIFICATION_DAYS = 21;

/** Late-2025 holidays, so a year of sprint history skips them too. */
const MN_PUBLIC_HOLIDAYS_2025_TAIL = [
  { date: '2025-11-21', name: 'Chinggis Khaan’s Birthday' },
  { date: '2025-11-26', name: 'Republic Day' },
  { date: '2025-12-29', name: 'National Freedom and Independence Day' },
];

const localMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - UB_OFFSET;
const localDate = (ms: number) => new Date(ms + UB_OFFSET).toISOString().slice(0, 10);

interface Weights {
  create: number;
  assign: number;
  comment: number;
  review: number;
  /** Multiplies how long their work takes. */
  speed: number;
}

const WEIGHTS: Record<Archetype, Weights> = {
  lead: { create: 3, assign: 1, comment: 2.5, review: 4, speed: 1 },
  commenter: { create: 0.4, assign: 0.2, comment: 6, review: 1.5, speed: 1.2 },
  overloaded: { create: 0.6, assign: 2.2, comment: 0.8, review: 0.3, speed: 2.4 },
  vacation: { create: 1, assign: 1.1, comment: 1, review: 0.6, speed: 1 },
  newcomer: { create: 0.3, assign: 0.8, comment: 0.6, review: 0, speed: 1.6 },
  left: { create: 1, assign: 1, comment: 1, review: 0.6, speed: 1.1 },
  executive: { create: 0.8, assign: 0.12, comment: 0.7, review: 0.4, speed: 1.5 },
  normal: { create: 1, assign: 1, comment: 1, review: 0.6, speed: 1 },
};

interface Person {
  def: PersonDef;
  id: string;
  name: string;
  email: string;
  joinedAt: number;
  leftAt: number | null;
  vacation: { from: number; to: number } | null;
  w: Weights;
  /** Still in the workspace. */
  member: boolean;
}

const employed = (p: Person, t: number) => t >= p.joinedAt && (p.leftAt === null || t < p.leftAt);
const away = (p: Person, t: number) =>
  p.vacation !== null && t >= p.vacation.from && t < p.vacation.to;
const available = (p: Person, t: number) => employed(p, t) && !away(p, t);

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const SIZE_DAYS: Record<Size, number> = { S: 0.7, M: 1.8, L: 4, XL: 8 };

interface Sprint {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  planningAt: number;
  endAt: number;
}

export type ScenarioRows = ReturnType<typeof buildScenario>;

/**
 * Every row of a scenario workspace, built in memory. Deterministic for a given `today`.
 * Dates are relative to `now`; nobody acts before joining, after leaving or while on vacation.
 */
export function buildScenario(
  def: ScenarioDef,
  { now: nowDate, passwordHash }: { now: Date; passwordHash: string },
) {
  const rng = createRng(def.seed);
  const now = nowDate.getTime();
  const today = localDate(now);
  const daysAgo = (n: number) => now - n * DAY;

  /** Moves an instant into working hours (most work happens Mon–Fri, 9:00–19:30). */
  const workTime = (ms: number): number => {
    let t = ms;
    for (let i = 0; i < 3; i++) {
      const local = new Date(t + UB_OFFSET);
      const dow = local.getUTCDay();
      const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
      if ((dow === 6 || dow === 0) && rng.chance(0.85)) {
        t += (dow === 6 ? 2 : 1) * DAY;
        continue;
      }
      if (hour < 9) {
        t += (9 - hour) * HOUR + rng.next() * 1.5 * HOUR;
        continue;
      }
      if (hour > 19.5 && rng.chance(0.75)) {
        t += (24 - hour + 9) * HOUR + rng.next() * 2 * HOUR;
        continue;
      }
      break;
    }
    return t;
  };

  // Workspace and people ------------------------------------------------------------------------
  const workspaceId = uuidv7();
  const emails = new Set<string>();
  const people: Person[] = def.people.map((d) => {
    const base = d.emailLocal ?? emailLocalFor(d.name);
    let local = base;
    for (let i = 2; emails.has(local); i++) local = `${base}${i}`;
    emails.add(local);
    return {
      def: d,
      id: uuidv7(),
      name: d.name,
      email: `${local}@${def.emailDomain}`,
      joinedAt: workTime(daysAgo(d.joinedDaysAgo) - 2 * DAY + 10 * HOUR),
      leftAt: d.leftDaysAgo === undefined ? null : localMidnight(addDays(today, -d.leftDaysAgo)),
      vacation: d.vacation
        ? {
            from: localMidnight(addDays(today, -d.vacation.fromDaysAgo)),
            to: localMidnight(addDays(today, d.vacation.untilDaysAhead)),
          }
        : null,
      w: WEIGHTS[d.archetype],
      member: d.archetype !== 'left',
    };
  });
  // joinedAt above lands before the day; pin newcomers to their exact day.
  for (const p of people) {
    if (p.def.joinedDaysAgo < 30) {
      p.joinedAt = localMidnight(addDays(today, -p.def.joinedDaysAgo)) + 9.5 * HOUR;
    }
  }
  const byKey = new Map(people.map((p) => [p.def.key, p]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const person = (key: string) => {
    const p = byKey.get(key);
    if (!p) throw new Error(`Scenario ${def.slug}: unknown person ${key}`);
    return p;
  };
  const owner = people.find((p) => p.def.role === 'owner');
  if (!owner) throw new Error(`Scenario ${def.slug}: no owner`);
  const userSnap = (p: Person) => ({ id: p.id, name: p.name });
  const mentionNode = (p: Person): RichTextNode => ({
    type: 'mention',
    attrs: { id: p.id, label: shortName(p.name) },
  });

  const users: Row<typeof schema.users>[] = people.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    initials: initialsFor(p.name),
    avatarColor: p.def.avatarColor,
    passwordHash,
    locale: p.def.locale,
    timezone: p.def.timezone ?? 'Asia/Ulaanbaatar',
    createdAt: new Date(p.joinedAt),
  }));
  const members: Row<typeof schema.workspaceMembers>[] = people
    .filter((p) => p.member)
    .map((p) => ({
      workspaceId,
      userId: p.id,
      role: p.def.role,
      title: p.def.title,
      capacityPoints: p.def.capacity ?? 15,
      joinedAt: new Date(p.joinedAt),
    }));
  const holidays = [...MN_PUBLIC_HOLIDAYS_2025_TAIL, ...MN_PUBLIC_HOLIDAYS_2026].map((h) => ({
    workspaceId,
    ...h,
  }));

  // Spaces, tags --------------------------------------------------------------------------------
  const spaceKeys = generateNKeysBetween(null, null, def.spaces.length);
  const spaceIds = new Map<string, string>();
  const spaces: Row<typeof schema.spaces>[] = def.spaces.map((s, i) => {
    const id = uuidv7();
    spaceIds.set(s.key, id);
    return {
      id,
      workspaceId,
      name: s.name,
      initial: s.initial,
      color: s.color,
      position: spaceKeys[i] ?? 'a0',
    };
  });
  const tags = def.tags.map((t) => ({ id: uuidv7(), workspaceId, name: t.name, color: t.color }));
  const tagByName = new Map(tags.map((t) => [t.name, t]));

  // Output rows ---------------------------------------------------------------------------------
  const projects: Row<typeof schema.projects>[] = [];
  const projectMembers: Row<typeof schema.projectMembers>[] = [];
  const statuses: Row<typeof schema.statuses>[] = [];
  const sprints: Row<typeof schema.sprints>[] = [];
  const tasks: (Row<typeof schema.tasks> & { id: string })[] = [];
  const assignees: Row<typeof schema.taskAssignees>[] = [];
  const taskTags: Row<typeof schema.taskTags>[] = [];
  const periods: Row<typeof schema.taskStatusPeriods>[] = [];
  const memberships: Row<typeof schema.sprintMemberships>[] = [];
  const comments: (Row<typeof schema.comments> & { id: string })[] = [];
  const subtasks: Row<typeof schema.subtasks>[] = [];
  const activity: ActivityRow[] = [];
  const notifications: Row<typeof schema.notifications>[] = [];
  const followers: Row<typeof schema.taskFollowers>[] = [];
  const favorites: Row<typeof schema.favorites>[] = [];

  // Hot threads: spread over projects by size.
  const hotQuota = new Map<string, number>();
  for (let i = 0; i < def.hotThreads; i++) {
    const p = rng.weighted(def.projects, (x) => x.tasks);
    if (p) hotQuota.set(p.key, (hotQuota.get(p.key) ?? 0) + 1);
  }
  // Each newcomer gets onboarding tasks in the first live project they're on.
  const onboardingIn = new Map<string, Person[]>();
  for (const p of people.filter((x) => x.def.archetype === 'newcomer')) {
    const project = def.projects.find((x) => !x.archivedDaysAgo && x.team.includes(p.def.key));
    if (project) onboardingIn.set(project.key, [...(onboardingIn.get(project.key) ?? []), p]);
  }

  const notifWindow = now - NOTIFICATION_DAYS * DAY;
  /** Inbox state: older notifications are mostly read; nothing gets read while away. */
  const notify = (to: Person, type: NotificationType, act: ActivityRow) => {
    const at = act.createdAt.getTime();
    if (!to.member || at < notifWindow || at < to.joinedAt || to.id === act.actorId) return;
    const lazy = to.def.archetype === 'overloaded';
    let readAt: number | null = null;
    if (!(to.vacation && at >= to.vacation.from)) {
      const old = at < now - 2 * DAY;
      if (rng.chance(old ? (lazy ? 0.5 : 0.92) : 0.35)) {
        readAt = Math.min(now - MINUTE, at + rng.lognormal(3 * HOUR, 1));
      }
    }
    notifications.push({
      userId: to.id,
      type,
      taskId: act.taskId,
      actorId: act.actorId,
      activityId: act.id,
      readAt: readAt === null ? null : new Date(readAt),
      archivedAt:
        readAt !== null && rng.chance(0.2) ? new Date(Math.min(now - MINUTE, readAt + DAY)) : null,
      createdAt: act.createdAt,
    });
  };

  const projectKeys = new Map<string, string[]>();
  for (const s of def.spaces) {
    const n = def.projects.filter((p) => p.space === s.key).length;
    projectKeys.set(s.key, generateNKeysBetween(null, null, n));
  }

  for (const pd of def.projects) {
    buildProject(pd);
  }

  // Favorites: a couple of each member's live projects.
  for (const p of people.filter((x) => x.member)) {
    const mine = def.projects.filter((x) => !x.archivedDaysAgo && x.team.includes(p.def.key));
    for (const pr of rng.sample(mine, rng.int(0, 3))) {
      const row = projects.find((x) => x.key === pr.key);
      if (row?.id) favorites.push({ userId: p.id, projectId: row.id });
    }
  }

  const standups = buildStandups(def, {
    workspaceId,
    ownerId: owner.id,
    now,
    people: people
      .filter((p) => p.member)
      .map((p) => ({
        key: p.def.key,
        id: p.id,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        vacation: p.vacation,
      })),
    tasks,
    assignees,
    statuses,
    holidays: new Set(holidays.map((h) => h.date)),
  });

  return {
    ...standups,
    workspace: {
      id: workspaceId,
      name: def.name,
      slug: def.slug,
      createdAt: new Date(Math.min(...people.map((p) => p.joinedAt))),
    },
    people,
    users,
    members,
    holidays,
    spaces,
    projects,
    projectMembers,
    statuses,
    sprints,
    tags,
    tasks,
    assignees,
    taskTags,
    periods,
    memberships,
    comments,
    subtasks,
    activity,
    notifications,
    followers,
    favorites,
  };

  // ---------------------------------------------------------------------------------------------

  function buildProject(pd: ProjectDef) {
    const projectId = uuidv7();
    const team = pd.team.map(person);
    const lead = person(pd.lead);
    const start = workTime(daysAgo(pd.createdDaysAgo));
    const end = pd.archivedDaysAgo === undefined ? now - MINUTE : daysAgo(pd.archivedDaysAgo);
    const spaceId = spaceIds.get(pd.space);
    if (!spaceId) throw new Error(`Scenario ${def.slug}: unknown space ${pd.space}`);
    const siblings = def.projects.filter((x) => x.space === pd.space);
    const projectRow: Row<typeof schema.projects> = {
      id: projectId,
      workspaceId,
      spaceId,
      name: pd.name,
      key: pd.key,
      color: pd.color,
      position: projectKeys.get(pd.space)?.[siblings.indexOf(pd)] ?? 'a0',
      leadId: lead.id,
      archivedAt: pd.archivedDaysAgo === undefined ? null : new Date(end),
      createdAt: new Date(start),
    };
    projects.push(projectRow);
    const projectTasks: (typeof tasks)[number][] = [];
    for (const p of team) if (p.member) projectMembers.push({ projectId, userId: p.id });

    const statusKeys = generateNKeysBetween(null, null, DEFAULT_STATUS_CATEGORIES.length);
    const status = {} as Record<
      StatusCategory,
      { id: string; name: null; category: StatusCategory }
    >;
    DEFAULT_STATUS_CATEGORIES.forEach((category, i) => {
      const id = uuidv7();
      status[category] = { id, name: null, category };
      statuses.push({ id, projectId, category, position: statusKeys[i] ?? 'a0' });
    });

    // Two-week sprints (Mon → Fri of the next week); the last one holds today.
    const projectSprints: Sprint[] = [];
    if (pd.sprints) {
      const anchor = '2026-01-05';
      let current = startOfWeek(today);
      const weeks = Math.round((localMidnight(current) - localMidnight(anchor)) / (7 * DAY));
      if (weeks % 2 !== 0) current = addDays(current, -7);
      const starts: string[] = [];
      for (let s = current; localMidnight(addDays(s, 12)) > start; s = addDays(s, -14)) {
        starts.unshift(s);
      }
      starts.forEach((s, i) => {
        const planningAt = Math.max(localMidnight(addDays(s, -3)) + 16 * HOUR, start + HOUR);
        if (planningAt >= end) return;
        const sprint: Sprint = {
          id: uuidv7(),
          number: i + 1,
          startDate: s,
          endDate: addDays(s, 11),
          planningAt,
          endAt: localMidnight(addDays(s, 12)),
        };
        projectSprints.push(sprint);
        sprints.push({
          id: sprint.id,
          projectId,
          number: sprint.number,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
        });
      });
    }
    const sprintSnap = (s: Sprint | null) =>
      s ? { id: s.id, name: null, number: s.number } : null;

    // Task creation times: steady, a little busier lately.
    interface Plan {
      createdAt: number;
      hot: boolean;
      onboarding: Person | null;
    }
    const plans: Plan[] = Array.from({ length: pd.tasks }, () => ({
      createdAt: Math.min(end - 10 * MINUTE, workTime(start + (end - start) * rng.next() ** 0.85)),
      hot: false,
      onboarding: null,
    }));
    for (const p of onboardingIn.get(pd.key) ?? []) {
      for (let i = 0; i < 4; i++) {
        plans.push({
          createdAt: Math.min(now - HOUR, p.joinedAt + (i + 1) * 20 * MINUTE),
          hot: false,
          onboarding: p,
        });
      }
    }
    const hotCandidates = plans.filter((x) => x.createdAt < end - 25 * DAY && !x.onboarding);
    for (const plan of rng.sample(hotCandidates, hotQuota.get(pd.key) ?? 0)) plan.hot = true;
    plans.sort((a, b) => a.createdAt - b.createdAt);

    const byStatus = new Map<string, { id: string; rank: number; number: number }[]>();
    const lang = (author?: Person): Locale =>
      author?.def.locale === 'en' && rng.chance(0.85) ? 'en' : rng.chance(pd.mn) ? 'mn' : 'en';
    const projectTagNames = pd.tags.filter((n) => tagByName.has(n));
    const topicSpeed = pd.topic === 'support' ? 0.4 : pd.topic === 'sales' ? 1.4 : 1;

    /** Someone who can act at `t`: the preferred people first, then the lead, then anyone. */
    const actorAt = (t: number, ...preferred: (Person | null | undefined)[]): Person => {
      for (const p of preferred) if (p && available(p, t)) return p;
      if (available(lead, t)) return lead;
      const anyone = rng.weighted(team, (p) => (available(p, t) ? p.w.create + 0.2 : 0));
      if (anyone) return anyone;
      return people.find((p) => available(p, t)) ?? lead;
    };

    plans.forEach((plan, index) => {
      const number = index + 1;
      const taskId = uuidv7();
      const created = plan.createdAt;
      const creator = plan.onboarding
        ? actorAt(created, lead)
        : (rng.weighted(team, (p) => (available(p, created) ? p.w.create : 0)) ?? actorAt(created));

      // Who does it.
      let taskAssignees: Person[] = [];
      if (plan.onboarding) taskAssignees = [plan.onboarding];
      else if (!rng.chance(plan.hot ? 0.05 : 0.12)) {
        // Anyone on the team at the time, including people who later left or went on vacation.
        const candidates = team.filter((p) => employed(p, created));
        const n = rng.chance(0.04) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const pick = rng.weighted(
            candidates.filter((p) => !taskAssignees.includes(p)),
            (p) => p.w.assign,
          );
          if (pick) taskAssignees.push(pick);
        }
      }
      const primary = taskAssignees[0] ?? null;
      const speed = primary?.w.speed ?? 1;

      const priority: Priority = plan.hot
        ? rng.pick(['urgent', 'high'] as const)
        : (rng.weighted(
            [
              ['none', 30],
              ['low', 18],
              ['medium', 30],
              ['high', 15],
              ['urgent', 7],
            ] as const,
            ([, w]) => w,
          )?.[0] ?? 'none');
      const size: Size | null =
        rng.weighted(
          [
            ['S', 40],
            ['M', 30],
            ['L', 12],
            ['XL', 4],
            [null, 14],
          ] as const,
          ([, w]) => w,
        )?.[0] ?? null;
      const workDays = (size ? SIZE_DAYS[size] : 1.5) * topicSpeed;

      const titleLang = lang();
      let title: string;
      if (plan.onboarding) {
        title = rng.pick(ONBOARDING[plan.onboarding.def.locale === 'en' ? 'en' : 'mn']);
      } else if (plan.hot) {
        title = rng.pick(HOT_TITLES[titleLang]);
      } else {
        title = rng.pick(TITLES[pd.topic][titleLang]);
        if (rng.chance(0.2)) title += rng.pick(TITLE_SUFFIX[titleLang]);
        if (pd.topic === 'support' && rng.chance(0.6)) title += ` — #${rng.int(40_000, 99_999)}`;
      }

      // Fate: most tasks flow to done; some never start, some stall half-way.
      const fate =
        plan.hot || plan.onboarding
          ? 'normal'
          : rng.chance(0.07)
            ? 'backlog'
            : rng.chance(primary?.def.archetype === 'overloaded' ? 0.14 : 0.06)
              ? 'stalled'
              : 'normal';
      const reviewed = rng.chance(pd.reviewShare ?? 0.5);
      const seq: StatusCategory[] = [];
      if (fate !== 'backlog') {
        seq.push('in_progress');
        if (reviewed) {
          seq.push('review');
          if (rng.chance(0.08)) seq.push('in_progress', 'review');
        }
        seq.push('done');
        if (rng.chance(0.03)) seq.push('in_progress', 'done');
        if (fate === 'stalled') {
          const stopAt = reviewed && rng.chance(0.3) ? seq.indexOf('review') : 0;
          seq.length = stopAt + 1;
        }
      }

      interface Step {
        category: StatusCategory;
        at: number;
        by: Person;
      }
      const steps: Step[] = [{ category: 'todo', at: created, by: creator }];
      const handoffs: { at: number; from: Person; to: Person; by: Person }[] = [];
      let current = primary;
      let reviewer: Person | null = null;
      let t = created;
      const cutoff = Math.min(end, now - MINUTE);
      for (const category of seq) {
        const prev = steps[steps.length - 1]?.category ?? 'todo';
        if (prev === 'todo') {
          const median = priority === 'urgent' ? 0.2 : priority === 'high' ? 0.8 : 2.5;
          t += rng.lognormal(median * DAY * Math.sqrt(speed) * topicSpeed, 1);
        } else if (prev === 'in_progress') {
          t += rng.lognormal(
            (category === 'review' && steps.some((s) => s.category === 'review') ? 0.6 : workDays) *
              DAY *
              speed,
            0.7,
          );
        } else if (prev === 'review') {
          t += rng.lognormal(1.3 * DAY, 0.9);
        } else {
          t += rng.lognormal(4 * DAY, 0.8);
        }
        if (plan.hot) t += rng.lognormal(3 * DAY, 0.6);

        // The assignee left: someone takes the task over, or it stays with them, untouched.
        if (current && current.leftAt !== null && t >= current.leftAt) {
          const handoffAt = workTime(current.leftAt + rng.lognormal(3 * DAY, 0.7));
          const next = rng.chance(0.55)
            ? rng.weighted(team, (p) => (p.member && available(p, handoffAt) ? p.w.assign : 0))
            : null;
          if (!next || handoffAt >= cutoff) break;
          handoffs.push({ at: handoffAt, from: current, to: next, by: actorAt(handoffAt, lead) });
          current = next;
          t = Math.max(t, handoffAt + rng.lognormal(DAY, 0.8));
        }
        // On vacation: nothing moves until they're back.
        if (current?.vacation && t >= current.vacation.from && t < current.vacation.to) {
          t = current.vacation.to + rng.lognormal(0.5 * DAY, 0.6);
        }
        t = workTime(t);
        const last = steps[steps.length - 1];
        if (last && t <= last.at) t = last.at + 5 * MINUTE;
        if (t >= cutoff) break;
        const enteringReview = category === 'review';
        const leavingReview = prev === 'review';
        if (enteringReview && !reviewer) {
          reviewer =
            rng.chance(0.65) && employed(lead, t)
              ? lead
              : (rng.weighted(team, (p) => (p !== current && available(p, t) ? p.w.review : 0)) ??
                lead);
        }
        const by =
          leavingReview && category === 'done'
            ? actorAt(t, reviewer, current)
            : actorAt(t, current, creator);
        steps.push({ category, at: t, by });
      }

      const final = steps[steps.length - 1] ?? {
        category: 'todo' as const,
        at: created,
        by: creator,
      };
      const completedAt = final.category === 'done' ? final.at : null;
      const lastStepAt = final.at;
      /** Still being worked on (vs. frozen: backlog, stalled, owner gone). */
      const live = completedAt === null && fate === 'normal' && (!current || current.member);

      // Due and start dates.
      const dueShare = pd.topic === 'support' ? 0.3 : pd.topic === 'finance' ? 0.75 : 0.6;
      let dueDate: string | null = null;
      if (plan.onboarding) dueDate = localDate(created + 3 * DAY);
      else if (rng.chance(dueShare)) {
        dueDate = localDate(created + rng.lognormal((workDays * 1.6 + 2.5) * DAY, 0.6));
      }
      let startDate: string | null = rng.chance(0.1)
        ? localDate(created + rng.next() * 2 * DAY)
        : null;
      if (startDate && dueDate && startDate > dueDate) startDate = dueDate;

      // Description.
      let description: RichTextNode | null = null;
      if (rng.chance(plan.hot ? 1 : 0.55)) {
        const content: RichTextNode[] = [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: rng.pick(DESCRIPTION_INTRO[titleLang]) }],
          },
        ];
        if (rng.chance(0.4)) {
          content.push({
            type: 'bulletList',
            content: rng.sample(CRITERIA[titleLang], rng.int(2, 4)).map((text) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          });
        }
        const cc = rng.chance(0.1)
          ? rng.pick(team.filter((p) => p.member && p !== creator).concat(lead))
          : null;
        if (cc) {
          content.push({
            type: 'paragraph',
            content: [{ type: 'text', text: 'CC ' }, mentionNode(cc)],
          });
        }
        description = { type: 'doc', content };
      }

      const taskFollowers = new Set<Person>([
        creator,
        ...taskAssignees,
        ...handoffs.map((h) => h.to),
      ]);
      const touches: number[] = [lastStepAt];
      const statusEvents: { row: ActivityRow; at: number }[] = [];
      const log = (
        type: ActivityType,
        actor: Person,
        at: number,
        payload: Record<string, unknown>,
      ) => {
        const row = {
          id: uuidv7(),
          workspaceId,
          projectId,
          taskId,
          actorId: actor.id,
          type,
          payload,
          createdAt: new Date(at),
        };
        activity.push(row);
        if (type !== 'comment.added') touches.push(at);
        return row;
      };

      // History: created, status changes, reviewer, handoffs.
      const createdRow = log('task.created', creator, created, { status: status.todo });
      for (const a of taskAssignees) if (a !== creator) notify(a, 'assigned', createdRow);
      steps.forEach((step, i) => {
        const next = steps[i + 1];
        const prev = steps[i - 1];
        periods.push({
          taskId,
          statusId: status[step.category].id,
          category: step.category,
          enteredAt: new Date(step.at),
          exitedAt: next ? new Date(next.at) : null,
          enteredBy: step.by.id,
          exitedBy: next?.by.id ?? null,
        });
        if (!prev) return;
        if (
          step.category === 'review' &&
          reviewer &&
          !steps.slice(0, i).some((s) => s.category === 'review')
        ) {
          log('reviewer.changed', step.by, step.at, { from: null, to: userSnap(reviewer) });
        }
        const row = log('status.changed', step.by, step.at, {
          from: status[prev.category],
          to: status[step.category],
        });
        statusEvents.push({ row, at: step.at });
      });
      for (const h of handoffs) {
        log('assignee.removed', h.by, h.at, { user: userSnap(h.from) });
        const row = log('assignee.added', h.by, h.at + MINUTE, { user: userSnap(h.to) });
        notify(h.to, 'assigned', row);
      }
      const finalAssignees =
        handoffs.length > 0
          ? [...taskAssignees.filter((a) => a !== handoffs[0]?.from), current].filter(
              (x): x is Person => x !== null,
            )
          : taskAssignees;

      // Sprints: joins the sprint running when it appeared, carried while unfinished.
      let sprintId: string | null = null;
      if (projectSprints.length > 0 && fate !== 'backlog' && !plan.onboarding && rng.chance(0.85)) {
        let k = projectSprints.findIndex((s) => s.endAt > created);
        const first = projectSprints[k];
        if (first) {
          let addedAt = created > first.planningAt ? created + 10 * MINUTE : first.planningAt;
          let from: Sprint | null = null;
          let carries = 0;
          while (k >= 0 && k < projectSprints.length && addedAt < cutoff) {
            const s = projectSprints[k];
            if (!s) break;
            const planner = actorAt(addedAt, lead, creator);
            log('sprint.changed', planner, addedAt, { from: sprintSnap(from), to: sprintSnap(s) });
            const next = projectSprints[k + 1];
            const finished = completedAt !== null && completedAt < s.endAt;
            if (!finished && next && next.planningAt < cutoff) {
              carries += 1;
              const drop =
                (carries >= 3 && rng.chance(0.45)) ||
                (!live && completedAt === null && lastStepAt < next.planningAt && rng.chance(0.6));
              const remover = actorAt(next.planningAt, lead);
              memberships.push({
                taskId,
                sprintId: s.id,
                addedAt: new Date(addedAt),
                removedAt: new Date(next.planningAt),
                addedBy: planner.id,
                removedBy: remover.id,
              });
              if (drop) {
                log('sprint.changed', remover, next.planningAt, { from: sprintSnap(s), to: null });
                break;
              }
              from = s;
              addedAt = next.planningAt;
              k += 1;
              continue;
            }
            memberships.push({
              taskId,
              sprintId: s.id,
              addedAt: new Date(addedAt),
              addedBy: planner.id,
            });
            sprintId = s.id;
            break;
          }
        }
      }

      // Comments: most tasks have none or a few; hot ones turn into long threads.
      const count = plan.hot
        ? rng.int(50, 140)
        : Math.round(
            (rng.chance(0.45)
              ? 0
              : rng.chance(0.55)
                ? rng.int(1, 2)
                : rng.chance(0.6)
                  ? rng.int(3, 5)
                  : rng.chance(0.85)
                    ? rng.int(6, 12)
                    : rng.int(13, 35)) * (fate === 'normal' ? 1 : 0.4),
          );
      let windowEnd = live
        ? cutoff
        : completedAt !== null
          ? completedAt + (rng.chance(0.1) ? rng.lognormal(DAY) : 0)
          : lastStepAt + rng.lognormal(3 * DAY, 0.8);
      if (plan.hot) windowEnd = Math.min(cutoff, created + rng.int(10, 60) * DAY);
      windowEnd = Math.min(windowEnd, cutoff);
      const windowStart = created + 15 * MINUTE;
      const participants = new Set<Person>([
        creator,
        ...finalAssignees,
        lead,
        ...(reviewer ? [reviewer] : []),
      ]);
      const crowd = plan.hot
        ? [
            ...team,
            ...rng.sample(
              people.filter((p) => p.member),
              8,
            ),
          ]
        : team;
      const times =
        windowEnd > windowStart
          ? Array.from({ length: count }, () =>
              workTime(windowStart + rng.next() * (windowEnd - windowStart)),
            )
              .filter((x) => x < cutoff)
              .sort((a, b) => a - b)
          : [];
      const commenters: { at: number; person: Person }[] = [];
      let lastTop: { id: string; at: number } | null = null;
      for (const at of times) {
        const author = rng.weighted(crowd, (p) =>
          available(p, at) ? p.w.comment * (participants.has(p) ? 3 : 1) : 0,
        );
        if (!author) continue;
        const l = lang(author);
        const mentionTarget = rng.chance(0.15)
          ? rng.weighted([...participants, ...team], (p) =>
              p !== author && p.member && employed(p, at) ? 1 : 0,
            )
          : null;
        const text =
          plan.hot && rng.chance(0.6)
            ? rng.pick(HOT_LINES[l])
            : author.def.archetype === 'commenter' && rng.chance(0.6)
              ? rng.pick(FEEDBACK[l])
              : rng.pick(COMMENTS[l]);
        const isReply = !mentionTarget && lastTop !== null && rng.chance(0.25);
        const content: RichTextNode[] = mentionTarget
          ? [mentionNode(mentionTarget), { type: 'text', text: rng.pick(MENTION_ASKS[l]) }]
          : [{ type: 'text', text }];
        const comment = addComment(author, at, content, isReply ? (lastTop?.id ?? null) : null);
        if (!isReply) lastTop = { id: comment.id, at };
        commenters.push({ at, person: author });
        if (mentionTarget) {
          // The mentioned person usually answers within hours.
          const replyAt = workTime(at + rng.lognormal(3 * HOUR, 1));
          if (rng.chance(0.7) && replyAt < cutoff && available(mentionTarget, replyAt)) {
            addComment(
              mentionTarget,
              replyAt,
              [{ type: 'text', text: rng.pick(REPLIES[lang(mentionTarget)]) }],
              comment.id,
            );
            commenters.push({ at: replyAt, person: mentionTarget });
          }
        }
      }

      function addComment(
        author: Person,
        at: number,
        content: RichTextNode[],
        parentId: string | null,
      ) {
        const body: RichTextNode = { type: 'doc', content: [{ type: 'paragraph', content }] };
        const row = {
          id: uuidv7(),
          taskId,
          authorId: author.id,
          parentId,
          body,
          bodyText: richTextToPlain(body),
          createdAt: new Date(at),
          editedAt: rng.chance(0.04) ? new Date(at + rng.lognormal(10 * MINUTE)) : null,
        };
        comments.push(row);
        const act = log('comment.added', author, at, { commentId: row.id });
        const mentioned = content
          .filter((n) => n.type === 'mention')
          .map((n) => byId.get(String(n.attrs?.id)))
          .filter((p): p is Person => p !== undefined);
        for (const p of mentioned) notify(p, 'mention', act);
        const following = new Set([
          ...taskFollowers,
          ...commenters.filter((c) => c.at < at).map((c) => c.person),
        ]);
        for (const p of following) {
          if (!mentioned.includes(p)) notify(p, 'comment', act);
        }
        taskFollowers.add(author);
        return row;
      }

      // Status notifications go to whoever followed the task at the time.
      for (const { row, at } of statusEvents) {
        const following = new Set([
          ...taskFollowers,
          ...commenters.filter((c) => c.at < at).map((c) => c.person),
        ]);
        for (const p of following) notify(p, 'status', row);
      }

      // Subtasks.
      if (rng.chance(size === 'L' || size === 'XL' ? 0.45 : plan.onboarding ? 0 : 0.15)) {
        const titles = rng.sample(SUBTASKS[titleLang], rng.int(2, 6));
        const keys = generateNKeysBetween(null, null, titles.length);
        titles.forEach((stTitle, i) => {
          const assignee = rng.chance(0.5)
            ? rng.weighted(team, (p) => (p.member && employed(p, created) ? 1 : 0))
            : null;
          const done =
            completedAt !== null
              ? rng.chance(0.92)
              : final.category === 'todo'
                ? false
                : rng.chance(0.5);
          const id = uuidv7();
          subtasks.push({
            id,
            taskId,
            title: stTitle,
            assigneeId: assignee?.id ?? null,
            done,
            position: keys[i] ?? 'a0',
          });
          log('subtask.added', creator, created + (i + 1) * 2 * MINUTE, {
            subtask: { id, title: stTitle },
          });
          if (done) {
            const until = completedAt ?? Math.min(cutoff, lastStepAt + DAY);
            const at = Math.min(until - MINUTE, created + rng.next() * (until - created));
            const actor = actorAt(at, assignee, current);
            log('subtask.completed', actor, Math.max(at, created + 30 * MINUTE), {
              subtask: { id, title: stTitle },
            });
          }
        });
      }

      // Occasional edits: priority bumped, due date pushed.
      const editUntil = Math.max(created + HOUR, live ? cutoff : lastStepAt);
      if (rng.chance(0.06)) {
        const at = created + rng.next() * (editUntil - created);
        log('priority.changed', actorAt(at, lead, creator), at, {
          from: rng.pick(
            (['none', 'low', 'medium', 'high'] as const).filter((x) => x !== priority),
          ),
          to: priority,
        });
      }
      if (dueDate && rng.chance(0.1)) {
        const at = created + rng.next() * (editUntil - created);
        log('due.changed', actorAt(at, current, lead), at, {
          from: addDays(dueDate, -rng.int(2, 10)),
          to: dueDate,
        });
      }

      // A few tasks were deleted later.
      let deletedAt: number | null = null;
      if (!plan.hot && !plan.onboarding && rng.chance(0.007)) {
        const at = Math.max(...touches) + rng.lognormal(5 * DAY);
        if (at < cutoff) {
          deletedAt = at;
          log('task.deleted', actorAt(at, lead, creator), at, {});
        }
      }

      // Tags: most tasks have none or one; popular tags dominate, the rest form a long tail.
      if (projectTagNames.length > 0) {
        const n = rng.chance(0.45) ? 0 : rng.chance(0.65) ? 1 : rng.chance(0.75) ? 2 : 3;
        const chosen = new Set<string>();
        for (let i = 0; i < n; i++) {
          const name = rng.weighted(
            projectTagNames,
            (x) => 1 / (projectTagNames.indexOf(x) + 1) ** 0.8,
          );
          if (name) chosen.add(name);
        }
        for (const name of chosen) {
          const tag = tagByName.get(name);
          if (tag) taskTags.push({ taskId, tagId: tag.id });
        }
      }

      for (const a of finalAssignees) assignees.push({ taskId, userId: a.id });
      for (const p of new Set([...taskFollowers, ...finalAssignees]))
        followers.push({ taskId, userId: p.id });

      const statusId = status[final.category].id;
      const list = byStatus.get(statusId) ?? [];
      list.push({ id: taskId, rank: PRIORITY_RANK[priority], number });
      byStatus.set(statusId, list);
      const taskRow = {
        id: taskId,
        projectId,
        number,
        statusId,
        sprintId,
        title,
        description,
        descriptionText: description ? richTextToPlain(description) : '',
        priority,
        size,
        reviewerId: reviewer?.id ?? null,
        startDate,
        dueDate,
        position: '',
        createdBy: creator.id,
        completedAt: completedAt === null ? null : new Date(completedAt),
        createdAt: new Date(created),
        updatedAt: new Date(Math.max(...touches)),
        deletedAt: deletedAt === null ? null : new Date(deletedAt),
      };
      tasks.push(taskRow);
      projectTasks.push(taskRow);
    });

    // Board order per status: most urgent first, then by number.
    const taskById = new Map(projectTasks.map((x) => [x.id, x]));
    for (const list of byStatus.values()) {
      list.sort((a, b) => a.rank - b.rank || a.number - b.number);
      const keys = generateNKeysBetween(null, null, list.length);
      list.forEach((item, i) => {
        const row = taskById.get(item.id);
        if (row) row.position = keys[i] ?? 'a0';
      });
    }
    projectRow.taskSeq = plans.length;
  }
}
