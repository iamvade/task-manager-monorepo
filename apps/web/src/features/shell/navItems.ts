/** Sidebar menu: two fixed links, then the optional ones the user shows or keeps under "More". */
export const FIXED_NAV = ['inbox', 'myTasks'] as const;
export const OPTIONAL_NAV = ['personal', 'standup', 'outlook', 'feedback', 'reports'] as const;

/** Optional links in the short list until the user hides them. */
const SHOWN_BY_DEFAULT: readonly OptionalNavKey[] = ['personal', 'standup'];

/** Optional links that can carry a badge, so "Show when badged" means something for them. */
export const BADGEABLE_NAV: readonly OptionalNavKey[] = ['standup', 'feedback'];

export type FixedNavKey = (typeof FIXED_NAV)[number];
export type OptionalNavKey = (typeof OPTIONAL_NAV)[number];
export type NavKey = FixedNavKey | OptionalNavKey;

/**
 * Where an optional link sits: always in the short list, there only while it has a badge
 * (unread feedback, a standup to post), or only under "More".
 */
export const NAV_VISIBILITIES = ['always', 'badged', 'hidden'] as const;
export type NavVisibility = (typeof NAV_VISIBILITIES)[number];

/** One optional link: its place in the user's order and where it shows. */
export interface NavPref {
  key: OptionalNavKey;
  visibility: NavVisibility;
}

export const DEFAULT_NAV: readonly NavPref[] = OPTIONAL_NAV.map((key) => ({
  key,
  visibility: SHOWN_BY_DEFAULT.includes(key) ? 'always' : 'hidden',
}));

export const isOptionalNav = (key: unknown): key is OptionalNavKey =>
  typeof key === 'string' && (OPTIONAL_NAV as readonly string[]).includes(key);

export const canBadge = (key: OptionalNavKey) => BADGEABLE_NAV.includes(key);

/** The choices offered for a link (no "Show when badged" for one that never has a badge). */
export const visibilitiesFor = (key: OptionalNavKey): readonly NavVisibility[] =>
  canBadge(key) ? NAV_VISIBILITIES : NAV_VISIBILITIES.filter((v) => v !== 'badged');

function visibilityOf(key: OptionalNavKey, item: { visibility?: unknown; shown?: unknown }) {
  const { visibility } = item;
  if (visibility === 'always' || visibility === 'hidden') return visibility;
  if (visibility === 'badged') return canBadge(key) ? 'badged' : 'hidden';
  // Lists saved before "Show when badged" existed stored `shown: boolean`.
  return item.shown === true ? 'always' : 'hidden';
}

/**
 * Saved prefs made safe: optional keys only, no duplicates, and any optional link the saved
 * list doesn't know (added later) put back at its default place with its default visibility
 * (so lists saved when Personal and Standup were fixed keep them on top, shown).
 */
export function normalizeNav(saved: unknown): NavPref[] {
  const result: NavPref[] = [];
  if (Array.isArray(saved)) {
    for (const item of saved as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const { key } = item as { key?: unknown };
      if (!isOptionalNav(key) || result.some((p) => p.key === key)) continue;
      result.push({ key, visibility: visibilityOf(key, item) });
    }
  }
  DEFAULT_NAV.forEach((pref, index) => {
    if (!result.some((p) => p.key === pref.key)) {
      result.splice(Math.min(index, result.length), 0, { ...pref });
    }
  });
  return result;
}

/** Moves `from` to where `to` is (a drag drop); unknown keys = unchanged. */
export function reorderNav(
  prefs: readonly NavPref[],
  from: OptionalNavKey,
  to: OptionalNavKey,
): NavPref[] {
  const fromIndex = prefs.findIndex((p) => p.key === from);
  const toIndex = prefs.findIndex((p) => p.key === to);
  const next = [...prefs];
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return next;
  const [moved] = next.splice(fromIndex, 1);
  if (moved) next.splice(toIndex, 0, moved);
  return next;
}

/** Whether a link is in the short list right now. */
export const inShortList = (pref: NavPref, badged: boolean) =>
  pref.visibility === 'always' || (pref.visibility === 'badged' && badged);
