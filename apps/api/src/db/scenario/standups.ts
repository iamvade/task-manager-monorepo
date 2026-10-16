import {
  addDays,
  STANDUP_REACTIONS,
  type StandupTodayItem,
  type StandupYesterdayItem,
  type StatusCategory,
} from '@kite/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schema/index.js';
import { createRng, type Rng } from './random.js';
import type { ScenarioDef, StandupGroupDef } from './types.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UB_OFFSET = 8 * HOUR;
/** Standup days of history per group (about three working weeks). */
const HISTORY_DAYS = 21;

const localMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - UB_OFFSET;
const localDate = (ms: number) => new Date(ms + UB_OFFSET).toISOString().slice(0, 10);
const hm = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * HOUR + m * MINUTE;
};
/** Mon = 0 … Sun = 6, as `standup_groups.days`. */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

type Pair = readonly [mn: string, en: string];

const YESTERDAY: readonly Pair[] = [
  ['Код хянаж, 2 PR нэгтгэсэн', 'Reviewed and merged 2 PRs'],
  ['Хэрэглэгчийн ярилцлагын тэмдэглэлийг цэгцэлсэн', 'Cleaned up the user interview notes'],
  ['Тестийн орчныг шинэчилсэн', 'Updated the staging environment'],
  ['Харилцагчтай уулзаж шаардлагыг тодруулсан', 'Met the client to clarify requirements'],
  ['Алдааны тайлангуудыг ангилсан', 'Triaged the bug reports'],
  ['Дизайны шүүмжид оролцсон', 'Joined the design critique'],
  ['Баримт бичгийг шинэчилсэн', 'Updated the docs'],
  ['Спринтийн төлөвлөлтөд бэлтгэсэн', 'Prepared for sprint planning'],
];

const TODAY: readonly Pair[] = [
  ['Код хянах', 'Code reviews'],
  ['Багийн гишүүнтэй 1:1', '1:1 with a teammate'],
  ['Тестүүдийг засах', 'Fix the flaky tests'],
  ['Харилцагчийн асуултад хариулах', 'Answer the client’s questions'],
  ['Дараагийн спринтийн ажлуудыг тодорхойлох', 'Scope next sprint’s work'],
  ['Гаргалтын тэмдэглэл бичих', 'Write the release notes'],
  [
    'Хэрэглэгчийн судалгааны тайланг бэлтгэж, бүтээгдэхүүний багтай хамтран дараагийн улирлын тэргүүлэх чиглэлүүдийг тодорхойлох ажлын уулзалтыг зохион байгуулах',
    'Prepare the user research report and run a working session with the product team to set next quarter’s priorities',
  ],
];

const BLOCKERS: readonly Pair[] = [
  ['Дизайны эцсийн хувилбарыг хүлээж байна', 'Waiting on the final designs'],
  ['Тестийн орчин ажиллахгүй байна', 'Staging is down'],
  ['API түлхүүрийн хугацаа дууссан', 'API keys have expired'],
  ['Хуулийн хэлтсийн зөвшөөрөл хүлээж байна', 'Waiting on legal sign-off'],
  ['Харилцагчаас хариу ирээгүй', 'No answer from the client yet'],
  [
    'Төлбөрийн үйлчилгээ үзүүлэгчийн туршилтын орчны API түлхүүрүүдийн хүчинтэй хугацаа дуусч, шинэ түлхүүр авахын тулд санхүүгийн хэлтэс болон гэрээний хариуцагчтай уулзах шаардлагатай болсон',
    'The payment provider’s sandbox API keys expired and new ones need a meeting with finance and the contract owner',
  ],
];

const REPLIES: readonly Pair[] = [
  ['Би туслая, 11 цагт ярья', 'I can help, let’s talk at 11'],
  ['Өнөөдөр шалгаад хэлье', 'I’ll check today and let you know'],
  ['Баярлалаа!', 'Thanks!'],
  ['Энэ асуудал надад бас тулгарсан', 'I ran into this too'],
];

const NOTES: readonly Pair[] = [
  ['• Саадуудыг өдрийн дотор шийдэх', '• Clear the blockers today'],
  ['• Гаргалтыг баасан гаригт хийнэ', '• Release on Friday'],
  ['• Шинэ гишүүнд код танилцуулна', '• Walk the new joiner through the code'],
  ['• Дараагийн долоо хоногт ретро', '• Retro next week'],
];

interface PersonRef {
  key: string;
  id: string;
  joinedAt: number;
  leftAt: number | null;
  vacation: { from: number; to: number } | null;
}

interface TaskRef {
  id: string;
  title: string;
  statusId: string;
  completedAt?: Date | null;
  deletedAt?: Date | null;
}

export interface StandupInput {
  workspaceId: string;
  ownerId: string;
  now: number;
  people: readonly PersonRef[];
  tasks: readonly TaskRef[];
  assignees: readonly { taskId: string; userId: string }[];
  statuses: readonly { id?: string; category: StatusCategory }[];
  holidays: ReadonlySet<string>;
}

/**
 * Standup groups with about three weeks of history: posts (items linked to the person's real
 * tasks), blockers (some still open, some with helpers), reactions, replies, past meetings with
 * saved notes, and today partly posted with reminders for those who haven't. Out-of-office
 * periods come from the `vacation` archetype. Deterministic for a given `now`.
 */
export function buildStandups(def: ScenarioDef, input: StandupInput) {
  const rng = createRng(def.seed + 17);
  const { now } = input;
  const today = localDate(now);
  const byKey = new Map(input.people.map((p) => [p.key, p]));
  const category = new Map(input.statuses.map((s) => [s.id ?? '', s.category]));
  const tasksOf = new Map<string, TaskRef[]>();
  const task = new Map(input.tasks.map((t) => [t.id, t]));
  for (const a of input.assignees) {
    const t = task.get(a.taskId);
    if (!t || t.deletedAt) continue;
    tasksOf.set(a.userId, [...(tasksOf.get(a.userId) ?? []), t]);
  }

  const groups: Row<typeof schema.standupGroups>[] = [];
  const members: Row<typeof schema.standupGroupMembers>[] = [];
  const entries: Row<typeof schema.standupEntries>[] = [];
  const blockers: Row<typeof schema.standupBlockers>[] = [];
  const reactions: Row<typeof schema.standupReactions>[] = [];
  const replies: Row<typeof schema.standupReplies>[] = [];
  const meetings: Row<typeof schema.standupMeetings>[] = [];
  const notices: Row<typeof schema.standupNotices>[] = [];
  const notifications: Row<typeof schema.notifications>[] = [];

  const absences: Row<typeof schema.userAbsences>[] = input.people
    .filter((p) => p.vacation && p.leftAt === null)
    .map((p) => ({
      id: uuidv7(),
      userId: p.id,
      startDate: localDate(p.vacation?.from ?? now),
      // `vacation.to` is the first day back.
      endDate: localDate((p.vacation?.to ?? now) - DAY),
      note: rng.chance(def.standups[0]?.mn ?? 1) ? 'Амралт' : 'Vacation',
      createdBy: p.id,
    }));
  const away = (p: PersonRef, date: string) =>
    absences.some((a) => a.userId === p.id && a.startDate <= date && date <= a.endDate);

  for (const g of def.standups) {
    buildGroup(g, rng);
  }

  function buildGroup(g: StandupGroupDef, r: Rng) {
    const createdAt = now - g.createdDaysAgo * DAY;
    const groupId = uuidv7();
    const facilitator = g.facilitator ? byKey.get(g.facilitator) : undefined;
    const postBy = g.postBy ?? '10:00';
    const reminderAt = g.reminderAt === undefined ? '09:30' : g.reminderAt;
    const meetingAt = g.meetingAt === undefined ? '10:15' : g.meetingAt;
    groups.push({
      id: groupId,
      workspaceId: input.workspaceId,
      name: g.name,
      timezone: 'Asia/Ulaanbaatar',
      days: [0, 1, 2, 3, 4],
      postBy,
      reminderAt,
      meetingAt,
      facilitatorId: facilitator?.id ?? null,
      speakingOrder: g.speakingOrder ?? 'posting_order',
      secondsPerPerson: g.secondsPerPerson ?? 120,
      totalMeetingMinutes: g.totalMeetingMinutes ?? 15,
      createdBy: input.ownerId,
      createdAt: new Date(createdAt),
    });
    const people = [...new Set(g.members)].flatMap((key) => {
      const p = byKey.get(key);
      return p?.leftAt === null ? [p] : [];
    });
    const keys = generateNKeysBetween(null, null, people.length);
    const addedAt = new Map<string, number>();
    people.forEach((p, i) => {
      const later = g.joinedDaysAgo?.[p.key];
      const at = Math.max(createdAt, p.joinedAt, later === undefined ? 0 : now - later * DAY);
      addedAt.set(p.id, at);
      members.push({
        groupId,
        userId: p.id,
        position: keys[i] ?? 'a0',
        addedAt: new Date(at),
      });
    });
    const text = (pair: Pair) => (r.chance(g.mn) ? pair[0] : pair[1]);

    const days: string[] = [];
    for (let d = 0; d < HISTORY_DAYS + 10 && days.length < HISTORY_DAYS; d++) {
      const date = addDays(today, -d);
      if (localMidnight(date) + DAY <= createdAt) break;
      if (weekday(date) > 4 || input.holidays.has(date)) continue;
      days.push(date);
    }

    /** Open blockers so far (carried until resolved). */
    for (const date of [...days].reverse()) {
      const start = localMidnight(date);
      const isToday = date === today;
      const posted: { entryId: string; userId: string; postedAt: number }[] = [];
      for (const p of people) {
        if ((addedAt.get(p.id) ?? 0) > start + DAY || away(p, date)) continue;
        if (!r.chance(isToday ? g.postRate * 0.55 : g.postRate)) continue;
        let postedAt = start + hm('08:20') + r.int(0, 130) * MINUTE;
        if (isToday && postedAt >= now) {
          if (now - start < hm('08:00')) continue;
          postedAt = now - r.int(5, 50) * MINUTE;
        }
        const entryId = uuidv7();
        const mine = tasksOf.get(p.id) ?? [];
        const done = mine.filter(
          (t) =>
            t.completedAt &&
            t.completedAt.getTime() < postedAt &&
            t.completedAt.getTime() > postedAt - 3 * DAY,
        );
        const open = mine.filter((t) => !t.completedAt && category.get(t.statusId) !== 'done');
        const yesterday: StandupYesterdayItem[] = [
          ...r
            .sample(done, 2)
            .map((t) => ({ kind: 'completed' as const, taskId: t.id, text: t.title })),
          ...(r.chance(0.6) ? [{ kind: 'text' as const, text: text(r.pick(YESTERDAY)) }] : []),
        ];
        const today_: StandupTodayItem[] = [
          ...r
            .sample(open, r.int(1, 2))
            .map((t) => ({ kind: 'task' as const, taskId: t.id, text: t.title })),
          ...(r.chance(0.5) ? [{ kind: 'text' as const, text: text(r.pick(TODAY)) }] : []),
        ];
        if (yesterday.length === 0) yesterday.push({ kind: 'text', text: text(r.pick(YESTERDAY)) });
        if (today_.length === 0) today_.push({ kind: 'text', text: text(r.pick(TODAY)) });
        const postByAt = start + hm(postBy);
        entries.push({
          id: entryId,
          groupId,
          userId: p.id,
          date,
          yesterday,
          today: today_,
          status: 'posted',
          postedAt: new Date(postedAt),
          isLate: postedAt > postByAt,
          createdAt: new Date(postedAt),
        });
        posted.push({ entryId, userId: p.id, postedAt });

        if (r.chance(0.16)) {
          const others = people.filter((o) => o.id !== p.id);
          const helper = others.length > 0 && r.chance(0.6) ? r.pick(others) : null;
          const linked = open.length > 0 && r.chance(0.6) ? r.pick(open) : null;
          // Older blockers mostly got resolved a day or two later; recent ones are still open.
          const age = (now - postedAt) / DAY;
          const resolved = age > 2 && r.chance(0.75);
          const resolvedAt = postedAt + r.int(3, 30) * HOUR;
          blockers.push({
            id: uuidv7(),
            entryId,
            text: text(r.pick(BLOCKERS)),
            taskId: linked?.id ?? null,
            helperIds: helper ? [helper.id] : [],
            resolvedAt: resolved && resolvedAt < now ? new Date(resolvedAt) : null,
            resolvedBy: resolved && resolvedAt < now ? (helper ?? p).id : null,
            createdAt: new Date(postedAt),
          });
        }
      }

      // Reactions and replies from teammates who were around.
      for (const e of posted) {
        const others = people.filter((o) => o.id !== e.userId);
        for (const o of r.sample(others, r.int(0, Math.min(3, others.length)))) {
          const at = e.postedAt + r.int(2, 90) * MINUTE;
          if (at >= now) continue;
          reactions.push({
            entryId: e.entryId,
            userId: o.id,
            emoji: r.pick(STANDUP_REACTIONS),
            createdAt: new Date(at),
          });
        }
        if (others.length > 0 && r.chance(0.18)) {
          const at = e.postedAt + r.int(5, 120) * MINUTE;
          if (at < now) {
            replies.push({
              id: uuidv7(),
              entryId: e.entryId,
              authorId: r.pick(others).id,
              body: text(r.pick(REPLIES)),
              createdAt: new Date(at),
            });
          }
        }
      }

      // Past meetings: the facilitator went through everyone who posted, notes saved.
      if (meetingAt && !isToday && facilitator && posted.length > 0 && r.chance(0.8)) {
        const startedAt = start + hm(meetingAt) + r.int(0, 4) * MINUTE;
        const order = [...posted].sort((a, b) => a.postedAt - b.postedAt).map((e) => e.userId);
        const durations: Record<string, number> = {};
        let total = 0;
        for (const id of order) {
          const s = r.int(35, (g.secondsPerPerson ?? 120) + 50);
          durations[id] = s;
          total += s + r.int(2, 8);
        }
        const saved = r.chance(0.7);
        meetings.push({
          id: uuidv7(),
          groupId,
          date,
          facilitatorId: facilitator.id,
          startedAt: new Date(startedAt),
          endedAt: new Date(startedAt + total * 1000),
          notes: r.sample(NOTES, r.int(1, 3)).map(text).join('\n'),
          notesSavedAt: saved ? new Date(startedAt + total * 1000) : null,
          speakingOrder: order,
          durations,
          totalSeconds: total,
          updatedAt: new Date(startedAt + total * 1000),
        });
      }

      // Today: the reminder went to everyone who hasn't posted (after its time).
      if (isToday && reminderAt && now >= start + hm(reminderAt)) {
        const sentAt = new Date(start + hm(reminderAt));
        for (const p of people) {
          if (posted.some((e) => e.userId === p.id) || away(p, date)) continue;
          if ((addedAt.get(p.id) ?? 0) > now) continue;
          notices.push({ groupId, userId: p.id, date, kind: 'reminder', sentAt });
          notifications.push({
            id: uuidv7(),
            userId: p.id,
            type: 'standup_reminder',
            standupGroupId: groupId,
            standupDate: date,
            createdAt: sentAt,
          });
        }
      }
    }
  }

  return {
    standupGroups: groups,
    standupGroupMembers: members,
    standupEntries: entries,
    standupBlockers: blockers,
    standupReactions: reactions,
    standupReplies: replies,
    standupMeetings: meetings,
    standupNotices: notices,
    standupNotifications: notifications,
    absences,
  };
}
