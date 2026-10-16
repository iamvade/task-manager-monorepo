import type { StandupReaction, StandupTodayItem, StandupYesterdayItem } from '@kite/shared';
import { addDays } from '@kite/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schema/index.js';
import type { PersonRef, Text } from './data.js';
import type { Clock } from './dates.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

interface Ctx {
  clock: Clock;
  pick: (text: Text) => string;
  workspaceId: string;
  user: (ref: PersonRef) => { id: string };
  task: (ref: string) => { row: { id: string } };
}

type Item = readonly [text: Text, taskRef?: string];
interface PostDef {
  by: PersonRef;
  at: string;
  yesterday: Item[];
  today: Item[];
  blockers: { text: Text; task?: string; helpers: PersonRef[] }[];
  reactions: [StandupReaction, PersonRef[]][];
  replies: [PersonRef, string, Text][];
}

/**
 * Today's Mobile team posts from Standup.dc.html (drawn on Fri Oct 9; seeded on today). Anu hasn't
 * posted yet and Mia is out of office.
 */
const MOBILE_POSTS: PostDef[] = [
  {
    by: 'sara',
    at: '09:05',
    yesterday: [
      [['Hover төлвүүдийг дуусгасан', 'Finished the hover states'], 'product-card'],
      [['48-аас 36 дүрс бэлэн', '36 of 48 icons done'], 'icon-set'],
    ],
    today: [
      [
        [
          'Үлдсэн 12 дүрсийг дуусгаад Тэмүүлэнд өгөх',
          'Finish the last 12 icons and hand off to Temuulen',
        ],
        'icon-set',
      ],
      [
        ['Танилцуулгын текстийн v3-ийг Анутай хянах', 'Review onboarding copy v3 with Anu'],
        'onboarding-copy',
      ],
    ],
    blockers: [],
    reactions: [
      ['thumbs_up', ['bat', 'tem']],
      ['heart', ['tem']],
    ],
    replies: [],
  },
  {
    by: 'bat',
    at: '09:12',
    yesterday: [
      [
        [
          '4 PR хянаж, төлбөрийн хуудасны засварыг нэгтгэсэн',
          'Reviewed 4 PRs, merged the checkout layout fixes',
        ],
        'checkout-responsive',
      ],
    ],
    today: [
      [['iOS Safari, Android дээр QA хийх', 'QA on iOS Safari and Android'], 'checkout-responsive'],
      [['Дорж, Тэмүүлэнтэй 1:1', '1:1s with Dorj and Temuulen']],
    ],
    blockers: [],
    reactions: [['thumbs_up', ['sara']]],
    replies: [],
  },
  {
    by: 'tem',
    at: '09:20',
    yesterday: [
      [
        [
          'Навигаци болон тэмдэглэгээний тоо ажиллаж байна',
          'Navigation and badge counts are working',
        ],
        'tab-bar',
      ],
    ],
    today: [
      [['Таб солих анимаци', 'Tab switch animations'], 'tab-bar'],
      [['Deep link-ийн тест бичих', 'Write tests for deep links']],
    ],
    blockers: [
      {
        text: [
          'Таб самбарыг гаргахын тулд эцсийн таб дүрс тэмдгийг хүлээж байна',
          'Waiting on final tab icons to ship the tab bar',
        ],
        task: 'tab-bar',
        helpers: ['sara'],
      },
    ],
    reactions: [
      ['thumbs_up', ['sara', 'bat', 'dorj']],
      ['eyes', ['bat']],
    ],
    replies: [
      [
        'sara',
        '09:24',
        [
          'Дүрс тэмдгүүд өнөөдөр 14:00 гэхэд бэлэн болно, мэдэгдье.',
          'Icons will be ready by 2pm today — I’ll ping you.',
        ],
      ],
      ['tem', '09:25', ['Гоё, баярлалаа!', 'Perfect, thanks!']],
    ],
  },
  {
    by: 'dorj',
    at: '09:41',
    yesterday: [
      [['Промо кодын урт кодын асуудлыг зассан', 'Fixed long promo codes overflowing'], 'promo-qa'],
      [
        ['Батын sticky bar-ын саналыг хэрэгжүүлсэн', 'Addressed Bat’s review on the sticky bar'],
        'checkout-responsive',
      ],
    ],
    today: [[['Буцаан олголтын урсгалыг турших', 'Test the refund flow'], 'payment-provider']],
    blockers: [
      {
        text: [
          'Төлбөрийн үйлчилгээ үзүүлэгчийн sandbox API түлхүүрийн хугацаа дууссан',
          'Payment provider sandbox API keys have expired',
        ],
        task: 'payment-provider',
        helpers: ['bat'],
      },
    ],
    reactions: [['thumbs_up', ['bat', 'tem']]],
    replies: [
      [
        'bat',
        '09:45',
        [
          'Шинэ түлхүүр хүсчихлээ, үдээс өмнө ирэх байх.',
          'Requested new keys — should land before noon.',
        ],
      ],
    ],
  },
];

/** Members in the order StandupSettings.dc.html lists them. */
const MOBILE_MEMBERS: PersonRef[] = ['bat', 'anu', 'sara', 'tem', 'dorj', 'mia'];
const DESIGN_MEMBERS: PersonRef[] = ['anu', 'sara', 'mia', 'oyu'];

/** Standup groups, today's Mobile team posts and the out-of-office periods. */
export function buildStandups({ clock, pick, workspaceId, user, task }: Ctx) {
  const created = clock.at([9, 1, '10:00']);
  const mobile = {
    id: uuidv7(),
    workspaceId,
    name: pick(['Мобайл баг', 'Mobile team']),
    facilitatorId: user('bat').id,
    createdBy: user('anu').id,
    createdAt: created,
  } satisfies Row<typeof schema.standupGroups>;
  const design = {
    id: uuidv7(),
    workspaceId,
    name: pick(['Дизайн баг', 'Design team']),
    meetingAt: null,
    facilitatorId: user('anu').id,
    createdBy: user('anu').id,
    createdAt: clock.at({ hoursAgo: 2 }),
  } satisfies Row<typeof schema.standupGroups>;

  const memberRows = (groupId: string, refs: PersonRef[]) => {
    const keys = generateNKeysBetween(null, null, refs.length);
    return refs.map((ref, i) => ({ groupId, userId: user(ref).id, position: keys[i] ?? 'a0' }));
  };

  const entries: Row<typeof schema.standupEntries>[] = [];
  const blockers: Row<typeof schema.standupBlockers>[] = [];
  const reactions: Row<typeof schema.standupReactions>[] = [];
  const replies: Row<typeof schema.standupReplies>[] = [];
  const at = (time: string) => clock.at([10, 8, time]);
  const taskId = (ref?: string) => (ref ? { taskId: task(ref).row.id } : {});

  for (const post of MOBILE_POSTS) {
    const postedAt = at(post.at);
    const entryId = uuidv7();
    entries.push({
      id: entryId,
      groupId: mobile.id,
      userId: user(post.by).id,
      date: clock.today,
      yesterday: post.yesterday.map(([text, ref]): StandupYesterdayItem => ({
        kind: 'text',
        text: pick(text),
        ...taskId(ref),
      })),
      today: post.today.map(([text, ref]): StandupTodayItem => ({
        kind: ref ? 'task' : 'text',
        text: pick(text),
        ...taskId(ref),
      })),
      status: 'posted',
      postedAt,
      isLate: false,
      createdAt: postedAt,
    });
    for (const b of post.blockers) {
      blockers.push({
        id: uuidv7(),
        entryId,
        text: pick(b.text),
        ...taskId(b.task),
        helperIds: b.helpers.map((ref) => user(ref).id),
        createdAt: postedAt,
      });
    }
    for (const [emoji, by] of post.reactions) {
      for (const ref of by)
        reactions.push({ entryId, userId: user(ref).id, emoji, createdAt: postedAt });
    }
    for (const [ref, time, body] of post.replies) {
      replies.push({
        id: uuidv7(),
        entryId,
        authorId: user(ref).id,
        body: pick(body),
        createdAt: at(time),
      });
    }
  }

  const absences: Row<typeof schema.userAbsences>[] = [
    // Mia is out until Sunday ("back Oct 12" on the standup page).
    {
      id: uuidv7(),
      userId: user('mia').id,
      startDate: clock.today,
      endDate: addDays(clock.today, 3),
      note: pick(['Амралт', 'Vacation']),
      createdBy: user('mia').id,
    },
    // Bayarmaa is on vacation this week (out-of-office badges, Workload "Away").
    {
      id: uuidv7(),
      userId: user('bay').id,
      startDate: addDays(clock.today, -1),
      endDate: addDays(clock.today, 6),
      note: pick(['Амралт', 'Vacation']),
      createdBy: user('bay').id,
    },
  ];

  return {
    standupGroups: [mobile, design],
    standupGroupMembers: [
      ...memberRows(mobile.id, MOBILE_MEMBERS),
      ...memberRows(design.id, DESIGN_MEMBERS),
    ],
    standupEntries: entries,
    standupBlockers: blockers,
    standupReactions: reactions,
    standupReplies: replies,
    absences,
  };
}
