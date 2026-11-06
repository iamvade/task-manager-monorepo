import type { Locale, NotificationType, StatusCategory } from './enums.js';
import { shortName } from './people.js';

/**
 * Text of a push notification, written by the server in the recipient's language, laid out like
 * the lock-screen pushes in `design/MobileInbox.dc.html`: a task push is titled "Bat O. · APP-142"
 * with "Mentioned you: “…”" under it; a standup push is titled "Standup · Mobile team" with the
 * Inbox sentence. The standup lines and status names are the web's (`inbox.standup.*`,
 * `status.*` in mn.json / en.json, without markup; `apps/web/src/push/pushText.test.ts` keeps
 * them equal). The task verbs beyond the design's "Mentioned you" are listed in
 * `docs/i18n-review.md`.
 */
export const PUSH_STRINGS = {
  en: {
    feed: {
      mentioned: 'Mentioned you',
      assigned: 'Assigned you',
      commented: 'Commented',
      statusChanged: 'Moved to {{status}}',
      completed: 'Completed',
      updated: 'Updated',
    },
    standupTitle: 'Standup · {{group}}',
    standup: {
      help: '{{actor}} asked for your help with a blocker in {{group}}',
      reply: '{{actor}} replied to your standup update in {{group}}',
      replyBlocker: '{{actor}} replied to your blocker in {{group}}',
      resolved: '{{actor}} resolved your blocker in {{group}}',
      mention: '{{actor}} mentioned you in {{group}}’s standup',
      reminder: 'Time to post your standup update for {{group}}',
      digest: '{{group}} standup: {{posted}} of {{expected}} have posted',
    },
    status: {
      todo: 'To Do',
      in_progress: 'In Progress',
      review: 'In Review',
      on_hold: 'On Hold',
      done: 'Done',
      cancelled: 'Cancelled',
    },
  },
  mn: {
    feed: {
      mentioned: 'Таныг дурдлаа',
      assigned: 'Таныг хариуцагчаар томиллоо',
      commented: 'Сэтгэгдэл бичлээ',
      statusChanged: 'Төлөвийг «{{status}}» болголоо',
      completed: 'Дуусгалаа',
      updated: 'Шинэчиллээ',
    },
    standupTitle: 'Стэндап · {{group}}',
    standup: {
      help: '{{actor}} {{group}}-ийн стэндапад саадаа шийдэхэд таныг туслахыг хүссэн',
      reply: '{{actor}} {{group}}-ийн стэндапад таны шинэчлэлд хариулсан',
      replyBlocker: '{{actor}} {{group}}-ийн стэндапад таны саадад хариулсан',
      resolved: '{{actor}} {{group}}-ийн стэндапад таны саадыг шийдсэн',
      mention: '{{actor}} таныг {{group}}-ийн стэндапад дурдсан',
      reminder: '{{group}}-д стэндапаа бичих цаг боллоо',
      digest: '{{group}} стэндап: {{expected}}-аас {{posted}} нь бичсэн',
    },
    status: {
      todo: 'Хийх',
      in_progress: 'Хийгдэж буй',
      review: 'Хянагдаж буй',
      on_hold: 'Түр зогссон',
      done: 'Дууссан',
      cancelled: 'Цуцалсан',
    },
  },
} as const satisfies Record<Locale, unknown>;

/** Quote marks around a comment, reply or blocker, as the design writes them. */
const QUOTES: Record<Locale, [string, string]> = { en: ['“', '”'], mn: ['«', '»'] };

export type PushFeedKey = keyof (typeof PUSH_STRINGS)['en']['feed'];
export type PushStandupKey = keyof (typeof PUSH_STRINGS)['en']['standup'];

/** What a push is written from (one notification, read back after it committed). */
export interface PushSource {
  type: NotificationType;
  actorName: string | null;
  task: { key: string; title: string } | null;
  /** The activity behind a task notification, and the status it moved to (status changes). */
  activityType: string | null;
  statusTo: { name: string | null; category: StatusCategory } | null;
  standup: { groupName: string; onBlocker: boolean } | null;
  digest: { posted: number; expected: number } | null;
  /** Comment, reply or blocker text (already shortened), shown under the line. */
  snippet: string | null;
}

/** Longest title we send; the body is the line plus a snippet the server already shortened. */
const TITLE_MAX = 120;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''));
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The Inbox line of a task notification (`feedLine` + `inboxLine` on the web). */
function feedKey(s: PushSource): PushFeedKey {
  if (s.type === 'mention') return 'mentioned';
  if (s.type === 'assigned') return 'assigned';
  if (s.activityType === 'comment.added') return 'commented';
  if (s.activityType === 'status.changed' && s.statusTo) {
    return s.statusTo.category === 'done' ? 'completed' : 'statusChanged';
  }
  return 'updated';
}

/** `standupLine` on the web. */
function standupKey(s: PushSource): PushStandupKey {
  switch (s.type) {
    case 'standup_help':
      return 'help';
    case 'standup_reply':
      return s.standup?.onBlocker ? 'replyBlocker' : 'reply';
    case 'standup_resolved':
      return 'resolved';
    case 'standup_reminder':
      return 'reminder';
    case 'standup_digest':
      return 'digest';
    default:
      return 'mention';
  }
}

/**
 * Title and body of one push. Task: "Sara K. · APP-142" over "Commented: “Looks good”" (or the
 * verb and the task title when there is nothing to quote). Standup: "Standup · Mobile team" over
 * the Inbox sentence, then the reply or blocker.
 */
export function pushText(s: PushSource, locale: Locale): { title: string; body: string } {
  const str = PUSH_STRINGS[locale];
  const [open, close] = QUOTES[locale];
  const actor = s.actorName ? shortName(s.actorName) : '';
  if (s.standup) {
    const line = fill(str.standup[standupKey(s)], {
      actor,
      group: s.standup.groupName,
      posted: s.digest?.posted ?? 0,
      expected: s.digest?.expected ?? 0,
    });
    return {
      title: clip(fill(str.standupTitle, { group: s.standup.groupName }), TITLE_MAX),
      body: s.snippet ? `${line}\n${open}${s.snippet}${close}` : line,
    };
  }
  const key = s.task?.key ?? '';
  const status = s.statusTo ? (s.statusTo.name ?? str.status[s.statusTo.category]) : '';
  const verb = fill(str.feed[feedKey(s)], { status });
  return {
    title: clip(actor ? `${actor} · ${key}` : key, TITLE_MAX),
    body: s.snippet
      ? `${verb}: ${open}${s.snippet}${close}`
      : `${verb} · ${clip(s.task?.title ?? '', TITLE_MAX)}`,
  };
}
