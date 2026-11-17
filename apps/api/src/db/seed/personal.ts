import type { RichTextNode } from '@kite/shared';
import { extractPersonalLinks, richTextToPlain } from '@kite/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schema/index.js';
import type { Text } from './data.js';
import type { Clock } from './dates.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

interface Ctx {
  clock: Clock;
  pick: (text: Text) => string;
  /** Anu: the signed-in person of the designs. */
  ownerId: string;
  /** A team task the notes link to (by id, like the editor does). */
  task: { id: string; key: string };
}

const DAY_MS = 86_400_000;

/**
 * Anu's personal space (not in the designs): two topics, a few notes and to-dos linked with
 * `[[links]]`, one link to a note not written yet, one to a team task, and one note with no links
 * (the "Unlinked" helper).
 */
export function buildPersonal({ clock, pick, ownerId, task }: Ctx) {
  const work = { id: uuidv7(), name: pick(['Ажил', 'Work']), color: 'violet' as const };
  const reading = { id: uuidv7(), name: pick(['Унших', 'Reading']), color: 'teal' as const };
  const topics: Row<typeof schema.personalTopics>[] = [work, reading].map((t, i) => ({
    ...t,
    userId: ownerId,
    position: `a${String(i)}`,
  }));
  const ids = {
    ideas: uuidv7(),
    checkout: uuidv7(),
    books: uuidv7(),
    prep: uuidv7(),
    loose: uuidv7(),
  };
  const text = (t: string): RichTextNode => ({ type: 'text', text: t });
  const item = (id: string, title: string): RichTextNode => ({
    type: 'itemLink',
    attrs: { id, title },
  });
  const doc = (...content: RichTextNode[]): RichTextNode => ({
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  });

  const defs: {
    id: string;
    kind: 'note' | 'todo';
    title: Text;
    topicId: string | null;
    body: RichTextNode | null;
    dueInDays?: number;
    done?: boolean;
    daysAgo: number;
  }[] = [
    {
      id: ids.ideas,
      kind: 'note',
      title: ['Дизайны санаанууд', 'Design ideas'],
      topicId: work.id,
      daysAgo: 6,
      body: doc(
        text(pick(['Төлбөрийн урсгалыг хялбарчлах: ', 'Simplify the payment flow: '])),
        item(ids.checkout, pick(['Checkout тэмдэглэл', 'Checkout notes'])),
        text(pick([', дараа нь ', ', then '])),
        {
          type: 'itemLink',
          attrs: { id: null, title: pick(['Хэрэглэгчийн ярилцлага', 'User interviews']) },
        },
        text('.'),
      ),
    },
    {
      id: ids.checkout,
      kind: 'note',
      title: ['Checkout тэмдэглэл', 'Checkout notes'],
      topicId: work.id,
      daysAgo: 4,
      body: doc(
        text(pick(['Багийн ажил: ', 'Team task: '])),
        { type: 'taskLink', attrs: { taskId: task.id, key: task.key } },
        text(pick([' — нээлттэй асуулт бий.', ' — open questions left.'])),
      ),
    },
    {
      id: ids.prep,
      kind: 'todo',
      title: ['Стэндапын тэмдэглэл бэлдэх', 'Prepare standup notes'],
      topicId: work.id,
      daysAgo: 1,
      dueInDays: 1,
      body: doc(
        text(pick(['Харах: ', 'See: '])),
        item(ids.ideas, pick(['Дизайны санаанууд', 'Design ideas'])),
      ),
    },
    {
      id: ids.books,
      kind: 'todo',
      title: ['«Refactoring UI»-г дуусгах', 'Finish “Refactoring UI”'],
      topicId: reading.id,
      daysAgo: 9,
      done: true,
      body: null,
    },
    {
      id: ids.loose,
      kind: 'note',
      title: ['Санамсаргүй бодол', 'Loose thoughts'],
      topicId: null,
      daysAgo: 2,
      body: doc(
        text(pick(['Сэдэвгүй, холбоосгүй тэмдэглэл.', 'A note with no topic and no links.'])),
      ),
    },
  ];

  const positions = generateNKeysBetween(null, null, defs.length);
  const items: Row<typeof schema.personalItems>[] = defs.map((d, i) => {
    const at = new Date(clock.now.getTime() - d.daysAgo * DAY_MS);
    return {
      id: d.id,
      userId: ownerId,
      kind: d.kind,
      topicId: d.topicId,
      title: pick(d.title),
      body: d.body,
      bodyText: d.body ? richTextToPlain(d.body) : '',
      dueDate:
        d.dueInDays === undefined
          ? null
          : new Date(clock.now.getTime() + d.dueInDays * DAY_MS).toISOString().slice(0, 10),
      doneAt: d.done ? at : null,
      position: positions[i] ?? `a${String(i)}`,
      createdAt: at,
      updatedAt: at,
    };
  });
  const links: Row<typeof schema.personalLinks>[] = items.flatMap((it) =>
    extractPersonalLinks(it.body).map((l) => ({
      userId: ownerId,
      sourceItemId: it.id ?? '',
      targetItemId: l.targetItemId,
      targetTaskId: l.targetTaskId,
      title: l.title,
      createdAt: it.createdAt,
    })),
  );
  return { personalTopics: topics, personalItems: items, personalLinks: links };
}
