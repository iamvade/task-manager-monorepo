import {
  addDays,
  addWorkingDays,
  isWorkingDay,
  richTextToPlain,
  startOfWeek,
  weekdayIndex,
  type Priority,
  type RichTextNode,
  type Size,
  type StatusCategory,
} from '@kite/shared';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schema/index.js';
import type { PersonRef, ProjectRef, Text } from './data.js';
import type { Clock } from './dates.js';

// Generated history for Reports (~24 weeks of completed tasks with status periods, sprint
// memberships, reviewers, comments with @mentions and replies, helping subtasks). Deterministic:
// a fixed-seed RNG, dates relative to today. Targets the numbers drawn in design/Reports*.dc.html:
// weekly throughput, In Review clearly the slowest stage, ~3 day cycle time, ~87% on time.

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Asia/Ulaanbaatar is UTC+8 with no DST. */
const UB_OFFSET = 8 * HOUR;

/** Small deterministic PRNG (mulberry32): the same seed always builds the same history. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Local (Ulaanbaatar) `YYYY-MM-DD` of an instant. */
export const ubDate = (at: Date) => new Date(at.getTime() + UB_OFFSET).toISOString().slice(0, 10);
/** The instant at local `date` + `minutes` after midnight. */
export const ubAt = (date: string, minutes: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - UB_OFFSET + minutes * MINUTE);

/** The last working day on or before `date`. */
export function workingDayOnOrBefore(date: string, holidays: ReadonlySet<string>) {
  let day = date;
  while (!isWorkingDay(day, holidays)) day = addDays(day, -1);
  return day;
}

export interface SprintWindow {
  number: number;
  /** First and last working day, `YYYY-MM-DD`. */
  start: string;
  end: string;
  /** Planning: the working day before the start, 16:00 (memberships added then are committed). */
  planningAt: Date;
  /** End of the last day. */
  endAt: Date;
}

/**
 * Sprints `first`…`current` of `days` working days each, today being day `dayToday` of the
 * current one; one working day between sprints for planning.
 */
export function planSprints(
  today: string,
  holidays: ReadonlySet<string>,
  {
    first,
    current,
    days,
    dayToday,
  }: { first: number; current: number; days: number; dayToday: number },
): SprintWindow[] {
  const windows: SprintWindow[] = [];
  let start = addWorkingDays(workingDayOnOrBefore(today, holidays), -(dayToday - 1), holidays);
  for (let n = current; n >= first; n--) {
    const end = addWorkingDays(start, days - 1, holidays);
    windows.unshift({
      number: n,
      start,
      end,
      planningAt: ubAt(addWorkingDays(start, -1, holidays), 16 * 60),
      endAt: ubAt(end, 24 * 60 - 1),
    });
    const previousEnd = addWorkingDays(start, -2, holidays);
    start = addWorkingDays(previousEnd, -(days - 1), holidays);
  }
  return windows;
}

/**
 * Tasks completed per Monday–Sunday week, oldest first: the previous 12 weeks, then the last 12
 * (the last one is the current, partial week as drawn on a Friday). Reports.dc.html.
 */
const WEEKLY_PREVIOUS = [22, 25, 27, 24, 28, 26, 29, 27, 30, 32, 31, 34];
const WEEKLY_CURRENT = [24, 28, 26, 31, 29, 34, 30, 33, 36, 35, 38, 33];

/** Share of completions per person (ReportsPeople.dc.html, plus Bayarmaa). */
const COMPLETION_WEIGHT: Record<PersonRef, number> = {
  // The drawn tasks already give Anu most of her recent completions.
  anu: 3,
  tem: 8,
  sara: 12,
  dorj: 14,
  mia: 7,
  oyu: 6,
  bat: 10,
  bay: 8,
};
/** Who reviews (ReportsPeople.dc.html review counts). */
const REVIEW_WEIGHT: Partial<Record<PersonRef, number>> = {
  bat: 15,
  anu: 6,
  dorj: 9,
  sara: 6,
  tem: 5,
  mia: 4,
  bay: 4,
};
/** Median hours to answer an @mention (ReportsPeople.dc.html "median reply"). */
const REPLY_HOURS: Record<PersonRef, number> = {
  anu: 1,
  tem: 4,
  sara: 2,
  dorj: 2,
  mia: 3,
  oyu: 1,
  bat: 1,
  bay: 2,
};

/** Median days per stage; In Review is clearly the slowest (Reports "Where work waits"). */
const STAGE_MEDIAN = { todo: 1.1, inProgress: 2.1, review: 5.6 } as const;
/** Under a third of the tasks go through review, which keeps the median cycle time ~3 days. */
const REVIEWED = 0.3;
const BOUNCED = 0.12;
const ON_TIME = 0.87;

const TITLES: Partial<Record<ProjectRef, readonly Text[]>> = {
  app: [
    ['Хайлтын үр дүнгийн хуудсыг сайжруулах', 'Polish search results page'],
    ['Сагсны цонхны загварыг шинэчлэх', 'Update cart drawer layout'],
    ['Бүтээгдэхүүний галерейн зураг ачааллыг хурдасгах', 'Speed up product gallery images'],
    ['Шүүлтүүрийн самбарын прототип', 'Prototype the filter panel'],
    ['Профайл хуудасны хоосон төлөвүүд', 'Empty states for the profile page'],
    ['Үнийн шошгоны бичвэрийг шалгах', 'Review price label copy'],
    ['Захиалгын түүхийн жагсаалт', 'Order history list'],
    ['Хүслийн жагсаалтын товчлуурын анимэйшн', 'Wishlist button animation'],
    ['Навигацийн дүрсүүдийг шинэчлэх', 'Refresh navigation icons'],
    ['Хэрэглэгчийн ярилцлагын тэмдэглэл нэгтгэх', 'Synthesize user interview notes'],
    ['Төлбөрийн алхмын алдааны мессежүүд', 'Error messages for the payment step'],
    ['Бүтээгдэхүүний картын хүртээмжийн засвар', 'Accessibility fixes on product cards'],
    ['Нүүр хуудасны баннерын хувилбарууд', 'Home banner variants'],
    ['Хүргэлтийн хаягийн маягтыг хялбарчлах', 'Simplify the shipping address form'],
    ['Бараан горимын дэлгэцүүдийг шалгах', 'QA dark mode screens'],
    ['Онбординг алхмуудын аналитик', 'Analytics for onboarding steps'],
  ],
  platform: [
    ['CI ажиллах хугацааг богиносгох', 'Cut CI run time'],
    ['Staging орчны нөөцлөлтийг шалгах', 'Verify staging backups'],
    ['Логийн хадгалалтын бодлого', 'Log retention policy'],
    ['Мэдээллийн сангийн индексүүдийг шалгах', 'Review database indexes'],
    ['Кэшийн тохиргоог шинэчлэх', 'Update cache settings'],
    ['Хамаарлуудын шинэчлэл', 'Dependency updates'],
    ['Алдааны хяналтын самбар', 'Error monitoring dashboard'],
    ['API хурдны хэмжилт', 'API latency benchmarks'],
    ['Нууц түлхүүрүүдийг сэлгэх', 'Rotate secrets'],
    ['Миграцийн скриптийг туршин ажиллуулах', 'Dry-run the migration script'],
  ],
  mobile: [
    ['iOS түлхэх мэдэгдлийн засвар', 'Fix iOS push notifications'],
    ['Android сагсны гацалт', 'Android cart crash'],
    ['Апп эхлэх хугацааг багасгах', 'Reduce app start time'],
    ['Офлайн горимын мессеж', 'Offline mode message'],
    ['Гүн холбоосын туршилт', 'Deep link testing'],
    ['Апп дэлгүүрийн зургууд', 'App store screenshots'],
    ['Таблетын байрлалыг шалгах', 'Check tablet layouts'],
    ['Хувилбарын тэмдэглэл', 'Release notes'],
    ['Хэрэглэгчийн санал хүсэлтийн дэлгэц', 'In-app feedback screen'],
    ['Биометр нэвтрэлтийн засвар', 'Biometric login fix'],
  ],
  bugs: [
    ['Нэвтрэх товч хоёр удаа дарагдах', 'Login button submits twice'],
    ['Хөнгөлөлтийн код буруу тооцогдох', 'Discount code miscalculated'],
    ['Хайлт хоосон үед гацах', 'Search hangs on empty query'],
    ['Огнооны формат буруу', 'Wrong date format'],
    ['Зураг ачаалагдахгүй байх', 'Images fail to load'],
    ['Сагсны тоо шинэчлэгдэхгүй', 'Cart count not refreshing'],
    ['Имэйл баталгаажуулалт хоцрох', 'Email verification delayed'],
    ['Төлбөрийн хуудас удаан ачаалах', 'Checkout loads slowly'],
    ['Мэдэгдлийн тоо буруу', 'Wrong notification count'],
    ['Гарах үед сесс үлдэх', 'Session survives logout'],
  ],
  ds: [
    ['Товчлуурын төлөвүүдийг баримтжуулах', 'Document button states'],
    ['Өнгөний токенуудыг цэгцлэх', 'Tidy color tokens'],
    ['Маягтын талбарын бүрэлдэхүүн', 'Form field component'],
    ['Дүрсний сангийн шинэчлэл', 'Icon library update'],
    ['Типографын шатлал', 'Type scale'],
    ['Модал бүрэлдэхүүн', 'Modal component'],
    ['Хүснэгтийн бүрэлдэхүүн', 'Table component'],
    ['Зайн токенууд', 'Spacing tokens'],
    ['Figma сангийн цэвэрлэгээ', 'Figma library cleanup'],
    ['Хүртээмжийн шалгах хуудас', 'Accessibility checklist'],
  ],
};

const COMMENTS: readonly Text[] = [
  ['Энэ дээр нэг харчих уу?', 'Can you take a look at this?'],
  ['Би дэлгэцийн бичлэг хавсаргалаа.', 'I attached a screen recording.'],
  ['Мобайл дээр бас шалгая.', 'Let’s check it on mobile too.'],
  ['Энэ хувилбар илүү ойлгомжтой байна.', 'This version reads much clearer.'],
  ['Дизайны файлтай таарч байгаа эсэхийг шалгаарай.', 'Please check it matches the design file.'],
  ['Хугацаандаа амжих уу?', 'Will this make the due date?'],
];
const REPLIES: readonly Text[] = [
  ['Тийм ээ, одоо харлаа.', 'Yes, looking now.'],
  ['Засчихлаа, дахин шалгаарай.', 'Fixed, please check again.'],
  ['Баярлалаа, нэмчихлээ.', 'Thanks, added it.'],
  ['Маргааш өглөө гэхэд бэлэн болно.', 'It will be ready tomorrow morning.'],
];
const SUBTASKS: readonly string[] = [
  'QA on iOS',
  'QA on Android',
  'Update copy',
  'Design review',
  'Write tests',
  'Check analytics events',
];

export interface HistoryProject {
  ref: ProjectRef;
  id: string;
  members: readonly PersonRef[];
  /** Product-space projects end their history before the shown calendar month. */
  product: boolean;
  /** Most history tasks this project may take (App Redesign keys stay below APP-121). */
  cap: number;
  /** Most history tasks per week (spreads a capped project over its sprints). */
  perWeek?: number;
  /** No history completed before this. */
  from?: Date;
  status: (category: StatusCategory) => { id: string; category: StatusCategory };
}

export interface HistoryInput {
  clock: Clock;
  holidays: ReadonlySet<string>;
  workspaceId: string;
  pick: (text: Text) => string;
  userId: (ref: PersonRef) => string;
  userName: (ref: PersonRef) => string;
  mention: (ref: PersonRef) => RichTextNode;
  projects: readonly HistoryProject[];
  /** Past sprints of the sprint project, with their ids. */
  sprints: readonly (SprintWindow & { id: string })[];
  sprintProject: ProjectRef;
  /** Who plans the sprints. */
  sprintOwner: PersonRef;
  /** Completion times of the hand-written tasks (counted against the weekly targets). */
  existingCompletions: readonly Date[];
  /** "Me": no generated history touches my tasks after this (My Tasks stays as designed). */
  me: PersonRef;
  meCutoff: Date;
  /** Product-space history ends before this (the Calendar month stays as designed). */
  productCutoff: Date;
}

export interface HistoryRows {
  tasks: (Row<typeof schema.tasks> & {
    id: string;
    projectRef: ProjectRef;
    number: number;
    position: string;
    createdAt: Date;
  })[];
  assignees: Row<typeof schema.taskAssignees>[];
  followers: Row<typeof schema.taskFollowers>[];
  subtasks: Row<typeof schema.subtasks>[];
  comments: (Row<typeof schema.comments> & { id: string })[];
  activity: (Row<typeof schema.activity> & { id: string })[];
  periods: Row<typeof schema.taskStatusPeriods>[];
  memberships: Row<typeof schema.sprintMemberships>[];
}

/** Builds the history rows; task numbers and positions are left to the caller. */
export function buildHistory(input: HistoryInput): HistoryRows {
  const rand = mulberry32(20261008);
  const { clock, holidays, userId } = input;
  const out: HistoryRows = {
    tasks: [],
    assignees: [],
    followers: [],
    subtasks: [],
    comments: [],
    activity: [],
    periods: [],
    memberships: [],
  };

  const between = (min: number, max: number) => min + rand() * (max - min);
  const chance = (p: number) => rand() < p;
  const oneOf = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(rand() * items.length)];
    if (item === undefined) throw new Error('Seed history: empty choice');
    return item;
  };
  const weighted = <T extends string>(
    weights: Partial<Record<T, number>>,
    allowed: (k: T) => boolean,
  ) => {
    const options = (Object.entries(weights) as [T, number][]).filter(
      ([k, w]) => w > 0 && allowed(k),
    );
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    if (total === 0) return null;
    let x = rand() * total;
    for (const [k, w] of options) {
      x -= w;
      if (x < 0) return k;
    }
    return options.at(-1)?.[0] ?? null;
  };
  /** Log-normal days around `median` (sigma ~0.6): mostly near the median, a long tail. */
  const lognormal = (median: number, sigma = 0.6) => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(sigma * z);
  };
  /** Moves an instant into working hours (09:30–19:00) of its local day, keeping the order. */
  const workHours = (at: Date) => {
    const date = ubDate(at);
    const minutes = (at.getTime() - ubAt(date, 0).getTime()) / MINUTE;
    return ubAt(date, 9.5 * 60 + (minutes / (24 * 60)) * 9.5 * 60);
  };

  // Weekly targets minus the hand-written completions of that week.
  const today = clock.today;
  const thisWeek = startOfWeek(today);
  const weeks = [...WEEKLY_PREVIOUS, ...WEEKLY_CURRENT].map((target, i) => {
    const start = addDays(thisWeek, (i - 23) * 7);
    const existing = input.existingCompletions.filter((at) => startOfWeek(ubDate(at)) === start);
    const isCurrent = start === thisWeek;
    // The drawn current week is Mon–Fri; scale it to the days gone so far.
    const scaled = isCurrent
      ? Math.round((target * Math.min(weekdayIndex(today) + 1, 5)) / 5)
      : target;
    return { start, count: Math.max(0, scaled - existing.length) };
  });

  const projectCounts = new Map<ProjectRef, number>();
  const weekCounts = new Map<string, number>();
  const sprintById = new Map(input.sprints.map((s) => [s.number, s]));
  const name = (ref: PersonRef) => ({ id: userId(ref), name: input.userName(ref) });
  const statusSnapshot = (project: HistoryProject, category: StatusCategory) => ({
    id: project.status(category).id,
    name: null,
    category,
  });

  for (const week of weeks) {
    const days = Array.from({ length: 7 }, (_, d) => addDays(week.start, d)).filter(
      (d) => d <= today && isWorkingDay(d, holidays),
    );
    if (days.length === 0) continue;
    for (let n = 0; n < week.count; n++) {
      // Completion: a working day of the week, 10:00–19:00, never in the future (today: earlier
      // today, so the week's count holds).
      const day = oneOf(days);
      let completedAt = ubAt(day, Math.floor(between(10 * 60, 19 * 60)));
      if (completedAt.getTime() > clock.now.getTime() - 10 * MINUTE) {
        const earliest = Math.max(ubAt(day, 0).getTime(), clock.now.getTime() - 4 * HOUR);
        const latest = clock.now.getTime() - 10 * MINUTE;
        if (latest <= earliest) continue;
        completedAt = new Date(between(earliest, latest));
      }
      const touchesMe = completedAt <= input.meCutoff;
      const allowed = (ref: PersonRef) => touchesMe || ref !== input.me;

      // Assignee and project (a project they're on, with room left).
      let assignee: PersonRef | null = null;
      let project: HistoryProject | undefined;
      for (let attempt = 0; attempt < 20 && !project; attempt++) {
        assignee = weighted(COMPLETION_WEIGHT, allowed);
        if (!assignee) break;
        const person = assignee;
        const options = input.projects.filter(
          (p) =>
            p.members.includes(person) &&
            (projectCounts.get(p.ref) ?? 0) < p.cap &&
            (weekCounts.get(`${p.ref}/${week.start}`) ?? 0) < (p.perWeek ?? Infinity) &&
            (!p.from || completedAt >= p.from) &&
            (!p.product || completedAt < input.productCutoff),
        );
        if (options.length > 0) project = oneOf(options);
      }
      if (!assignee || !project) continue;
      const proj = project;
      const owner = assignee;
      projectCounts.set(proj.ref, (projectCounts.get(proj.ref) ?? 0) + 1);
      weekCounts.set(
        `${proj.ref}/${week.start}`,
        (weekCounts.get(`${proj.ref}/${week.start}`) ?? 0) + 1,
      );
      const others = proj.members.filter((m) => m !== owner && allowed(m));

      // Stages, worked back from the completion.
      let reviewer = chance(REVIEWED)
        ? weighted(REVIEW_WEIGHT, (k) => k !== owner && allowed(k) && proj.members.includes(k))
        : null;
      const bounced = reviewer !== null && chance(BOUNCED);
      interface Stage {
        category: StatusCategory;
        days: number;
        actor: PersonRef;
      }
      const stages: Stage[] = [
        { category: 'todo', days: lognormal(STAGE_MEDIAN.todo, 0.75), actor: owner },
      ];
      stages.push({
        category: 'in_progress',
        days: lognormal(STAGE_MEDIAN.inProgress),
        actor: owner,
      });
      if (reviewer) {
        if (bounced) {
          stages.push({
            category: 'review',
            days: lognormal(STAGE_MEDIAN.review * 0.9, 0.5),
            actor: owner,
          });
          stages.push({ category: 'in_progress', days: lognormal(0.8, 0.5), actor: reviewer });
          stages.push({ category: 'review', days: lognormal(3.6, 0.5), actor: owner });
        } else {
          stages.push({
            category: 'review',
            days: lognormal(STAGE_MEDIAN.review, 0.5),
            actor: owner,
          });
        }
      }
      // Entry times, latest first; each stage ends where the next begins.
      const entries: Date[] = [];
      let cursor = completedAt.getTime();
      for (let i = stages.length - 1; i >= 0; i--) {
        cursor -= (stages[i]?.days ?? 1) * DAY;
        entries.unshift(workHours(new Date(cursor)));
      }
      for (let i = entries.length - 2; i >= 0; i--) {
        const next = entries[i + 1] ?? completedAt;
        const here = entries[i];
        if (here && here.getTime() >= next.getTime())
          entries[i] = new Date(next.getTime() - 20 * MINUTE);
      }
      // Sprints: tasks of the sprint project finished during a sprint were (mostly) in it, planned
      // from the backlog (created before planning), added mid-sprint, or carried over from the
      // sprint before.
      let chain: (SprintWindow & { id: string })[] = [];
      let addedMidSprint = false;
      if (proj.ref === input.sprintProject) {
        const sprint = input.sprints.find(
          (s) => completedAt >= s.planningAt && completedAt <= s.endAt,
        );
        const roll = rand();
        if (sprint && roll < 0.92) {
          chain = [sprint];
          addedMidSprint = roll >= 0.8;
          if (!addedMidSprint && chance(0.22)) {
            for (let back = sprint.number - 1; back >= sprint.number - 2; back--) {
              const earlier = sprintById.get(back);
              if (!earlier || (back < sprint.number - 1 && !chance(0.3))) break;
              chain.unshift(earlier);
            }
          }
          const first = chain[0] ?? sprint;
          const workStarts = entries[1]?.getTime() ?? completedAt.getTime();
          const sprintStart = ubAt(sprint.start, 9.5 * 60).getTime();
          if (addedMidSprint) {
            // Created after the start, before work began.
            if (sprintStart < workStarts) {
              entries[0] = new Date(
                between(sprintStart, Math.min(workStarts, sprintStart + 3 * DAY)),
              );
            }
          } else {
            // Planned from the backlog, picked up early in the sprint, then waiting in review
            // until done: in App Redesign work waits in review (the Reports insight).
            const done = completedAt.getTime();
            const created = first.planningAt.getTime() - between(0.2, 2) * DAY;
            let started = sprintStart + lognormal(0.6, 0.6) * DAY;
            if (started > done - 0.5 * DAY) {
              started = Math.max(
                created + HOUR,
                done - Math.max(0.3 * DAY, (done - sprintStart) * 0.6),
              );
            }
            if (!reviewer && chance(0.75)) {
              reviewer = weighted(
                REVIEW_WEIGHT,
                (k) => k !== owner && allowed(k) && proj.members.includes(k),
              );
            }
            let reviewing = started + lognormal(STAGE_MEDIAN.inProgress, 0.5) * DAY;
            if (reviewing > done - 0.2 * DAY) reviewing = started + (done - started) * 0.5;
            stages.length = 0;
            stages.push({ category: 'todo', days: 0, actor: owner });
            stages.push({ category: 'in_progress', days: 0, actor: owner });
            entries.length = 0;
            entries.push(new Date(created), new Date(started));
            if (reviewer) {
              stages.push({ category: 'review', days: 0, actor: owner });
              entries.push(new Date(reviewing));
            }
          }
        }
      }
      const createdAt = entries[0] ?? completedAt;
      const creator = chance(0.6) ? owner : others.length ? oneOf(others) : owner;

      // The task.
      const id = uuidv7();
      const completedDate = ubDate(completedAt);
      const hasDue = chance(0.93);
      const dueDate = hasDue
        ? chance(ON_TIME)
          ? addDays(completedDate, Math.floor(between(0, 6)))
          : addDays(completedDate, -Math.floor(between(1, 5)))
        : null;
      // Product-space due dates stay out of the shown calendar month.
      const due =
        dueDate && proj.product && dueDate >= ubDate(input.productCutoff)
          ? addDays(ubDate(input.productCutoff), -1)
          : dueDate;
      const sized = weighted<Size | 'none'>({ S: 33, M: 42, L: 18, XL: 3, none: 4 }, () => true);
      const size: Size | null = sized === 'none' ? null : sized;
      const priority =
        weighted<Priority>({ none: 10, low: 25, medium: 40, high: 20, urgent: 5 }, () => true) ??
        'medium';
      const title = input.pick(oneOf(TITLES[proj.ref] ?? TITLES.app ?? []));
      const doneStatus = proj.status('done');
      const task = {
        id,
        projectRef: proj.ref,
        projectId: proj.id,
        number: 0,
        statusId: doneStatus.id,
        sprintId: null as string | null,
        title,
        priority,
        size,
        reviewerId: reviewer ? userId(reviewer) : null,
        dueDate: due,
        position: '',
        createdBy: userId(creator),
        completedAt,
        createdAt,
        updatedAt: completedAt,
      };
      out.tasks.push(task);
      out.assignees.push({ taskId: id, userId: userId(owner) });
      const followers = new Set([creator, owner, ...(reviewer ? [reviewer] : [])]);

      const log = (
        actor: PersonRef,
        type: Row<typeof schema.activity>['type'],
        at: Date,
        payload: Record<string, unknown>,
      ) => {
        out.activity.push({
          id: uuidv7(),
          workspaceId: input.workspaceId,
          projectId: proj.id,
          taskId: id,
          actorId: userId(actor),
          type,
          payload,
          createdAt: at,
        });
      };

      // Status periods and their activity.
      log(creator, 'task.created', createdAt, { status: statusSnapshot(proj, 'todo') });
      const flow = [
        ...stages.map((s, i) => ({ ...s, at: entries[i] ?? createdAt })),
        {
          category: 'done' as const,
          days: 0,
          actor: reviewer ?? owner,
          at: completedAt,
        },
      ];
      for (let i = 0; i < flow.length; i++) {
        const stage = flow[i];
        const next = flow[i + 1];
        if (!stage) continue;
        out.periods.push({
          taskId: id,
          statusId: proj.status(stage.category).id,
          category: stage.category,
          enteredAt: stage.at,
          exitedAt: next?.at ?? null,
          enteredBy: userId(i === 0 ? creator : stage.actor),
          exitedBy: next ? userId(next.actor) : null,
        });
        if (i > 0) {
          const previous = flow[i - 1];
          if (previous) {
            log(stage.actor, 'status.changed', stage.at, {
              from: statusSnapshot(proj, previous.category),
              to: statusSnapshot(proj, stage.category),
            });
          }
          if (
            stage.category === 'review' &&
            reviewer &&
            flow.findIndex((f) => f.category === 'review') === i
          ) {
            log(stage.actor, 'reviewer.changed', stage.at, { from: null, to: name(reviewer) });
          }
        }
      }
      const workStart = flow[1]?.at ?? createdAt;

      // Comments on others' tasks, with @mentions answered a few hours later.
      const commentCount = others.length
        ? (chance(0.55) ? 1 : 0) + (chance(0.3) ? 1 : 0) + (chance(0.1) ? 1 : 0)
        : 0;
      for (let c = 0; c < commentCount; c++) {
        const author = oneOf(others);
        const at = new Date(between(workStart.getTime(), completedAt.getTime()));
        const mentioned = chance(0.45)
          ? chance(0.7)
            ? owner
            : oneOf(proj.members.filter((m) => m !== author && allowed(m)))
          : null;
        const text = input.pick(oneOf(COMMENTS));
        const body: RichTextNode = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: mentioned
                ? [input.mention(mentioned), { type: 'text', text: ` ${text}` }]
                : [{ type: 'text', text }],
            },
          ],
        };
        const commentId = uuidv7();
        out.comments.push({
          id: commentId,
          taskId: id,
          authorId: userId(author),
          body,
          bodyText: richTextToPlain(body),
          createdAt: at,
        });
        log(author, 'comment.added', at, { commentId });
        followers.add(author);
        if (mentioned && chance(0.92)) {
          const replyAt = new Date(at.getTime() + lognormal(REPLY_HOURS[mentioned], 0.7) * HOUR);
          const limit = touchesMe
            ? Math.min(input.meCutoff.getTime(), clock.now.getTime())
            : clock.now.getTime();
          if (replyAt.getTime() < limit - MINUTE) {
            const replyBody: RichTextNode = {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: input.pick(oneOf(REPLIES)) }],
                },
              ],
            };
            const replyId = uuidv7();
            out.comments.push({
              id: replyId,
              taskId: id,
              authorId: userId(mentioned),
              parentId: commentId,
              body: replyBody,
              bodyText: richTextToPlain(replyBody),
              createdAt: replyAt,
            });
            log(mentioned, 'comment.added', replyAt, { commentId: replyId });
            followers.add(mentioned);
          }
        }
      }

      // Subtasks, some checked off by teammates (Reports "Helping others").
      if (chance(0.3)) {
        const count = 1 + Math.floor(rand() * 3);
        for (let s = 0; s < count; s++) {
          const doneBy = others.length && chance(0.35) ? oneOf(others) : owner;
          const subtaskId = uuidv7();
          const subtitle =
            SUBTASKS[(s + Math.floor(rand() * SUBTASKS.length)) % SUBTASKS.length] ?? 'QA';
          out.subtasks.push({
            id: subtaskId,
            taskId: id,
            title: subtitle,
            assigneeId: userId(doneBy),
            done: true,
            position: `a${String(s)}`,
          });
          const at = new Date(between(workStart.getTime(), completedAt.getTime()));
          log(doneBy, 'subtask.completed', at, { subtask: { id: subtaskId, title: subtitle } });
        }
      }
      for (const ref of followers) out.followers.push({ taskId: id, userId: userId(ref) });

      // Sprint memberships: each sprint of the chain from its planning (or the mid-sprint
      // add), the earlier ones closed at the next planning (carried over).
      let from: { id: string; name: null; number: number } | null = null;
      chain.forEach((s, i) => {
        const nextSprint = chain[i + 1];
        const addedAt = addedMidSprint
          ? new Date(
              Math.min(
                Math.max(createdAt.getTime() + 5 * MINUTE, ubAt(s.start, 9 * 60).getTime()),
                completedAt.getTime() - MINUTE,
              ),
            )
          : s.planningAt;
        out.memberships.push({
          taskId: id,
          sprintId: s.id,
          addedAt,
          removedAt: nextSprint ? nextSprint.planningAt : null,
          addedBy: userId(input.sprintOwner),
          removedBy: nextSprint ? userId(input.sprintOwner) : null,
        });
        const to = { id: s.id, name: null, number: s.number };
        log(input.sprintOwner, 'sprint.changed', addedAt, { from, to });
        from = to;
        task.sprintId = s.id;
      });
    }
  }
  return out;
}
