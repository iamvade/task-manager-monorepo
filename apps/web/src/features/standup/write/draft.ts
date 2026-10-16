import {
  MAX_STANDUP_BLOCKERS,
  MAX_STANDUP_ITEMS,
  type SaveStandupEntry,
  type StandupEntry,
  type StandupEntryStatus,
  type StandupSuggestions,
  type StandupTaskRef,
  type UserRef,
} from '@kite/shared';

/** The write modal's state (StandupWrite.dc.html): three sections of rows. */
export type YesterdayKind = 'completed' | 'review' | 'commented' | 'text';

export interface YesterdayRow {
  uid: string;
  kind: YesterdayKind;
  task: StandupTaskRef | null;
  text: string;
}

export interface TextRow {
  uid: string;
  text: string;
}

export interface BlockerRow {
  uid: string;
  /** An existing blocker of my update (keeps its resolved state and replies). */
  id?: string;
  text: string;
  task: StandupTaskRef | null;
  helpers: UserRef[];
}

export interface Draft {
  yesterday: YesterdayRow[];
  /** Removed suggestion rows ("Restore 2 removed"). */
  removed: YesterdayRow[];
  /** Suggestions past the first few, offered behind "Show N more" (not on the update yet). */
  more: YesterdayRow[];
  /** Today chips: my open tasks (suggested, plus ones already on my update). */
  chips: { task: StandupTaskRef; tag: 'overdue' | 'due_today' | 'in_progress' | null }[];
  /** Task ids of the chips that are on. */
  picked: string[];
  today: TextRow[];
  blockers: BlockerRow[];
}

/** How many Yesterday suggestions a new update starts with. */
export const SUGGESTED_YESTERDAY = 5;
const KIND_RANK = { completed: 0, review: 1, commented: 2 } as const;

let seq = 0;
export const uid = () => `r${String((seq += 1))}`;

const emptyBlocker = (): BlockerRow => ({ uid: uid(), text: '', task: null, helpers: [] });

/**
 * The first state: my saved update (draft or posted) as written, else Yesterday from my
 * activity and nothing picked for Today (design-notes §5.11 Q11).
 */
export function initialDraft(entry: StandupEntry | null, suggestions: StandupSuggestions): Draft {
  const chips: Draft['chips'] = suggestions.today.map((s) => ({ task: s.task, tag: s.tag }));
  if (!entry) {
    // Strongest first (completed, moved to review, commented on), newest first within a kind;
    // only the first few go on the update, so someone who commented on twenty tasks isn't
    // removing rows one by one.
    const rows = [...suggestions.yesterday]
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
      .map((s) => ({ uid: uid(), kind: s.kind, task: s.task, text: s.task.title }));
    return {
      yesterday: rows.slice(0, SUGGESTED_YESTERDAY),
      more: rows.slice(SUGGESTED_YESTERDAY),
      removed: [],
      chips,
      picked: [],
      today: [],
      blockers: [emptyBlocker()],
    };
  }
  const picked: string[] = [];
  const today: TextRow[] = [];
  for (const item of entry.today) {
    if (item.kind === 'task' && item.task) {
      picked.push(item.task.id);
      if (!chips.some((c) => c.task.id === item.task?.id)) {
        chips.push({ task: item.task, tag: null });
      }
    } else {
      today.push({ uid: uid(), text: item.text });
    }
  }
  const blockers: BlockerRow[] = entry.blockers.map((b) => ({
    uid: uid(),
    id: b.id,
    text: b.text,
    task: b.task,
    helpers: b.helpers,
  }));
  const kept = new Set(entry.yesterday.map((item) => item.task?.id));
  return {
    yesterday: entry.yesterday.map((item) => ({
      uid: uid(),
      kind: item.kind,
      task: item.task,
      text: item.text,
    })),
    // A draft I come back to still offers the suggestions I removed ("Restore 2 removed").
    removed:
      entry.status === 'draft'
        ? suggestions.yesterday
            .filter((s) => !kept.has(s.task.id))
            .map((s) => ({ uid: uid(), kind: s.kind, task: s.task, text: s.task.title }))
        : [],
    more: [],
    chips,
    picked,
    today,
    blockers: blockers.length > 0 ? blockers : [emptyBlocker()],
  };
}

export const withEmptyBlocker = emptyBlocker;

/** The `PUT …/entry` body; blank rows are left out. */
export function draftBody(draft: Draft, status: StandupEntryStatus): SaveStandupEntry {
  const text = (s: string) => s.trim().slice(0, 500);
  const yesterday = draft.yesterday
    .filter((r) => text(r.text) || r.task)
    .map((r) => ({
      kind: r.kind,
      ...(r.task ? { taskId: r.task.id } : {}),
      text: text(r.text) || (r.task?.title ?? ''),
    }));
  const chipsOn = draft.chips
    .filter((c) => draft.picked.includes(c.task.id))
    .map((c) => ({ kind: 'task' as const, taskId: c.task.id, text: c.task.title.slice(0, 500) }));
  const today = [
    ...chipsOn,
    ...draft.today
      .filter((r) => text(r.text))
      .map((r) => ({ kind: 'text' as const, text: text(r.text) })),
  ];
  const blockers = draft.blockers
    .filter((b) => text(b.text))
    .map((b) => ({
      ...(b.id ? { id: b.id } : {}),
      text: text(b.text),
      taskId: b.task?.id ?? null,
      helperIds: b.helpers.map((h) => h.id),
    }));
  return {
    status,
    yesterday: yesterday.slice(0, MAX_STANDUP_ITEMS),
    today: today.slice(0, MAX_STANDUP_ITEMS),
    blockers: blockers.slice(0, MAX_STANDUP_BLOCKERS),
  };
}

/**
 * What a save would change, without the status and the blocker ids (the ids only come
 * back from the server): equal keys = nothing new to save.
 */
export function contentKey(body: SaveStandupEntry): string {
  return JSON.stringify({
    yesterday: body.yesterday,
    today: body.today,
    blockers: body.blockers?.map(({ id: _id, ...rest }) => rest),
  });
}

/** The blocker rows a body sends, in its order (blank rows are left out). */
export function sentBlockerUids(draft: Draft): { uid: string; id?: string }[] {
  return draft.blockers
    .filter((b) => b.text.trim())
    .slice(0, MAX_STANDUP_BLOCKERS)
    .map((b) => ({ uid: b.uid, ...(b.id ? { id: b.id } : {}) }));
}

/**
 * After a save, gives new blocker rows the ids the server made for them, so the next save
 * updates them instead of deleting and re-creating them. New blockers come back after the
 * existing ones, in the order they were sent. Rows whose blocker the server no longer has
 * lose their id.
 */
export function withSavedBlockerIds(
  draft: Draft,
  sent: readonly { uid: string; id?: string }[],
  entry: StandupEntry,
): Draft {
  const known = new Set(sent.flatMap((b) => (b.id ? [b.id] : [])));
  const fresh = entry.blockers.filter((b) => !known.has(b.id)).map((b) => b.id);
  const ids = new Map<string, string>();
  for (const b of sent) {
    if (b.id) continue;
    const id = fresh.shift();
    if (id) ids.set(b.uid, id);
  }
  const onServer = new Set(entry.blockers.map((b) => b.id));
  return {
    ...draft,
    blockers: draft.blockers.map((b) => {
      const id = ids.get(b.uid);
      if (id && !b.id) return { ...b, id };
      // Saved while blank: the server deleted it, so it goes back as a new blocker.
      if (b.id && !onServer.has(b.id)) {
        const { id: _gone, ...rest } = b;
        return rest;
      }
      return b;
    }),
  };
}

/** Whether the update has anything in it (Post is disabled until it does). */
export function isEmptyBody(body: SaveStandupEntry): boolean {
  return !body.yesterday?.length && !body.today?.length && !body.blockers?.length;
}
