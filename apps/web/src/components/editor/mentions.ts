import type { UserRef } from '@kite/shared';

/** A person offered in @-suggestions: avatar, name and a role hint ("Eng lead", "You"). */
export interface MentionCandidate extends UserRef {
  hint?: string | null;
}

export const MAX_SUGGESTIONS = 6;

/**
 * Candidates matching `query` (case-insensitive): names starting with it first, then names with
 * a word starting with it, then any substring; the input order (project team first) breaks ties.
 */
export function filterMentions(
  candidates: readonly MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, MAX_SUGGESTIONS);
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return candidates
    .map((c, i) => ({ c, i, r: rank(c.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => x.c);
}
