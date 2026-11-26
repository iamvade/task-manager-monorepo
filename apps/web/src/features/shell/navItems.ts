/** Sidebar menu: two fixed links, then the optional ones the user shows or keeps under "More". */
export const FIXED_NAV = ['inbox', 'myTasks'] as const;
export const OPTIONAL_NAV = ['personal', 'standup', 'outlook', 'feedback', 'reports'] as const;

/** Optional links in the short list until the user hides them. */
const SHOWN_BY_DEFAULT: readonly OptionalNavKey[] = ['personal', 'standup'];

export type FixedNavKey = (typeof FIXED_NAV)[number];
export type OptionalNavKey = (typeof OPTIONAL_NAV)[number];
export type NavKey = FixedNavKey | OptionalNavKey;

/** One optional link: its place in the user's order and whether it sits in the short list. */
export interface NavPref {
  key: OptionalNavKey;
  shown: boolean;
}

export const DEFAULT_NAV: readonly NavPref[] = OPTIONAL_NAV.map((key) => ({
  key,
  shown: SHOWN_BY_DEFAULT.includes(key),
}));

const isOptional = (key: unknown): key is OptionalNavKey =>
  typeof key === 'string' && (OPTIONAL_NAV as readonly string[]).includes(key);

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
      const { key, shown } = item as { key?: unknown; shown?: unknown };
      if (!isOptional(key) || result.some((p) => p.key === key)) continue;
      result.push({ key, shown: shown === true });
    }
  }
  DEFAULT_NAV.forEach((pref, index) => {
    if (!result.some((p) => p.key === pref.key)) {
      result.splice(Math.min(index, result.length), 0, { ...pref });
    }
  });
  return result;
}

/** Swaps the item at `index` with its neighbor (`-1` up, `1` down); out of range = unchanged. */
export function moveNav(prefs: readonly NavPref[], index: number, by: -1 | 1): NavPref[] {
  const target = index + by;
  if (index < 0 || target < 0 || target >= prefs.length) return [...prefs];
  const next = [...prefs];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}
