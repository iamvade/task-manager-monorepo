import type { RichTextNode, StandupMeetingTask } from '@kite/shared';

/** The design's task title: the item text up to " — " ("Sandbox keys expired — Bat can help"). */
export const taskTitleOf = (text: string) => (text.split(' — ')[0] ?? text).trim().slice(0, 500);

export type ItemSource =
  | { kind: 'today'; entryId: string; itemIndex: number }
  | { kind: 'blocker'; entryId: string; blockerId: string };

/** The task already created from this item for the day's summary, if any. */
export function createdFrom(
  tasks: readonly StandupMeetingTask[],
  source: ItemSource,
): StandupMeetingTask | undefined {
  return tasks.find(
    (t) =>
      t.source.entryId === source.entryId &&
      t.source.kind === source.kind &&
      (source.kind === 'blocker'
        ? t.source.blockerId === source.blockerId
        : t.source.itemIndex === source.itemIndex),
  );
}

/** One paragraph linking back to the standup day (rich text only takes absolute links). */
export function backLinkDoc(text: string, href: string): RichTextNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  };
}
