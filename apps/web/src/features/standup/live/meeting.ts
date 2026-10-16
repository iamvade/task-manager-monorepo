import type {
  RichTextNode,
  StandupEntry,
  StandupMeeting,
  StandupMeetingSpeaker,
  StandupMeetingTask,
} from '@kite/shared';

/** Out of office and hasn't posted: listed last, skipped by Previous / Next, not clickable. */
export const isSkipped = (s: StandupMeetingSpeaker) => s.state === 'out' && s.entryId === null;

/** The next (or previous) person who speaks after `fromId`, or null at the end. */
export function neighbor(
  meeting: StandupMeeting,
  fromId: string | null,
  step: 1 | -1,
): StandupMeetingSpeaker | null {
  const order = meeting.order;
  const at = order.findIndex((s) => s.user.id === fromId);
  for (let i = at + step; i >= 0 && i < order.length; i += step) {
    const s = order[i];
    if (s && !isSkipped(s)) return s;
  }
  return null;
}

/** Seconds `userId` has spoken so far (finished turns plus the running one), at `now` (ms). */
export function spokenSeconds(meeting: StandupMeeting, userId: string, now: number): number {
  const done = meeting.durations[userId] ?? 0;
  if (meeting.currentUserId !== userId || !meeting.currentStartedAt) return done;
  return done + Math.max(0, Math.floor((now - Date.parse(meeting.currentStartedAt)) / 1000));
}

/** The meeting's running total: every finished turn plus the current one. */
export function totalSeconds(meeting: StandupMeeting, now: number): number {
  if (meeting.endedAt && meeting.totalSeconds !== null) return meeting.totalSeconds;
  const done = Object.values(meeting.durations).reduce((a, b) => a + b, 0);
  const running =
    meeting.currentUserId && meeting.currentStartedAt
      ? Math.max(0, Math.floor((now - Date.parse(meeting.currentStartedAt)) / 1000))
      : 0;
  return done + running;
}

/** "06:12" (minutes may pass 99: "125:04"). */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** The design's task title: the item text up to " — " ("Sandbox keys expired — Bat can help"). */
export const taskTitleOf = (text: string) => (text.split(' — ')[0] ?? text).trim().slice(0, 500);

export type ItemSource =
  | { kind: 'today'; entryId: string; itemIndex: number }
  | { kind: 'blocker'; entryId: string; blockerId: string };

/** The task already created from this item in the meeting, if any. */
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

/** The posted update of a speaker that day (null when they haven't posted). */
export const entryOf = (entries: readonly StandupEntry[], speaker: StandupMeetingSpeaker) =>
  entries.find((e) => e.id === speaker.entryId) ?? null;
