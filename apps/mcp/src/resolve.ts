/**
 * Turns what a person (or Claude) says — "Anu", "in review", "app" — into Kite ids. Never
 * guesses: no match or several matches is a `ToolError` that lists the choices.
 */
import {
  nameSearchKey,
  parseTaskKey,
  type Status,
  type StatusCategory,
  type WorkspaceMember,
} from '@kite/shared';
import en from '../../web/src/i18n/locales/en.json' with { type: 'json' };
import mn from '../../web/src/i18n/locales/mn.json' with { type: 'json' };

/** A mistake the caller can fix; its message goes back to Claude as the tool result. */
export class ToolError extends Error {
  override name = 'ToolError';
}

const fold = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
/** Names match across scripts ("Bat" = "Бат"), see `nameSearchKey`. */
const foldName = (s: string) => nameSearchKey(fold(s));

/** The UI's names for the default statuses (null `name`), in both languages. */
const DEFAULT_STATUS_NAMES: Record<'en' | 'mn', Record<StatusCategory, string>> = {
  en: en.status,
  mn: mn.status,
};

/** What the UI shows for a status: its own name, else the category's English name. */
export function statusLabel(status: Pick<Status, 'name' | 'category'>): string {
  return status.name ?? DEFAULT_STATUS_NAMES.en[status.category];
}

/**
 * The project's status for `query`: its name (English or Mongolian default names too) or a
 * category key (`todo`, `in_progress`, `review`, `on_hold`, `done`, `cancelled`). A category
 * picks that category's first status.
 */
export function matchStatus(statuses: readonly Status[], query: string): Status {
  const q = fold(query);
  const byName = statuses.filter((s) => {
    const names = s.name
      ? [s.name]
      : [DEFAULT_STATUS_NAMES.en[s.category], DEFAULT_STATUS_NAMES.mn[s.category]];
    return names.some((n) => fold(n) === q);
  });
  const [named, ...sameName] = byName;
  if (named && sameName.length === 0) return named;
  if (!named) {
    const category = q.replace(/[\s-]+/g, '_');
    const inCategory = statuses.find((s) => s.category === category);
    if (inCategory) return inCategory;
  }
  const choices = statuses.map((s) => `"${statusLabel(s)}" (${s.category})`).join(', ');
  throw new ToolError(
    byName.length > 1
      ? `Several statuses are called "${query}": ${choices}. Use the category instead.`
      : `No status "${query}" in this project. Statuses: ${choices}.`,
  );
}

/**
 * The workspace member `query` names: `me`, an email, a full name, or a first name / unique start
 * of a name. Deactivated members are never matched.
 */
export function matchMember(
  members: readonly WorkspaceMember[],
  query: string,
  meId: string,
): WorkspaceMember {
  const active = members.filter((m) => m.deactivatedAt === null);
  const raw = fold(query.replace(/^@/, ''));
  if (raw === 'me' || raw === 'myself') {
    const me = active.find((m) => m.user.id === meId);
    if (me) return me;
  }
  const q = foldName(raw);
  const tiers: ((m: WorkspaceMember) => boolean)[] = [
    (m) => fold(m.user.email) === raw,
    (m) => foldName(m.user.name) === q,
    (m) => foldName(m.user.name).split(' ')[0] === q,
    (m) => foldName(m.user.name).startsWith(q),
  ];
  for (const tier of tiers) {
    const hits = active.filter(tier);
    const [hit, ...more] = hits;
    if (hit && more.length === 0) return hit;
    if (hit) {
      const names = hits.map((m) => `${m.user.name} <${m.user.email}>`).join(', ');
      throw new ToolError(`"${query}" matches several people: ${names}. Use the email.`);
    }
  }
  throw new ToolError(
    `Nobody called "${query}" in this workspace. Use list_members to see who is there.`,
  );
}

/** `app-142` → `APP-142`; anything else is a `ToolError`. */
export function taskKey(input: string): string {
  const parsed = parseTaskKey(input);
  if (!parsed) throw new ToolError(`"${input}" is not a task key like APP-142.`);
  return `${parsed.key}-${parsed.number}`;
}

/** `YYYY-MM-DD` that is a real calendar day, or null to clear. */
export function parseDate(input: string | null): string | null {
  if (input === null) return null;
  const value = input.trim();
  const d = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(d.getTime())) {
    throw new ToolError(`"${input}" is not a date like 2026-11-14.`);
  }
  if (d.toISOString().slice(0, 10) !== value) throw new ToolError(`${value} is not a real date.`);
  return value;
}

/**
 * One of a task's subtasks: its 1-based position in the list (`2`, `#2`) or its exact title
 * (case and spacing aside). A title several subtasks share is a `ToolError` listing positions.
 */
export function matchSubtask<T extends { title: string }>(
  subtasks: readonly T[],
  query: string,
): T {
  const list = subtasks
    .map((s, i) => `${i + 1}. ${s.title.replace(/\s+/g, ' ').trim()}`)
    .join('; ');
  if (subtasks.length === 0) throw new ToolError('This task has no subtasks.');
  const q = fold(query);
  const hits = subtasks.filter((s) => fold(s.title) === q);
  const [hit, ...more] = hits;
  if (hit && more.length === 0) return hit;
  if (hit) {
    throw new ToolError(`Several subtasks are called "${query}". Use the position: ${list}.`);
  }
  const position = /^#?(\d{1,4})$/.exec(q);
  if (position) {
    const found = subtasks[Number(position[1]) - 1];
    if (found) return found;
  }
  throw new ToolError(`No subtask "${query}". Subtasks: ${list}.`);
}
