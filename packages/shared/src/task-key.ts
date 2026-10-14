/** `APP` + 142 → `APP-142`. */
export const formatTaskKey = (projectKey: string, number: number) => `${projectKey}-${number}`;

const TASK_KEY = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;

/** `app-142` → `{ key: 'APP', number: 142 }`; null when the text isn't a task key. */
export function parseTaskKey(text: string): { key: string; number: number } | null {
  const match = TASK_KEY.exec(text.trim());
  if (!match?.[1] || !match[2]) return null;
  const number = Number(match[2]);
  if (number < 1 || number > 2_147_483_647) return null;
  return { key: match[1].toUpperCase(), number };
}

/** Task keys inside text: uppercase project key, dash, number (`APP-142`; not `covid-19`). */
const TASK_KEY_IN_TEXT = /(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,9})-(\d{1,9})(?![A-Za-z0-9])/g;

/** Every distinct task key mentioned in `text`, in order of first appearance. */
export function findTaskKeys(text: string): { key: string; number: number; text: string }[] {
  const seen = new Set<string>();
  const found: { key: string; number: number; text: string }[] = [];
  for (const match of text.matchAll(TASK_KEY_IN_TEXT)) {
    const [whole, key, digits] = match;
    if (!key || !digits) continue;
    const number = Number(digits);
    if (number < 1 || number > 2_147_483_647 || seen.has(whole)) continue;
    seen.add(whole);
    found.push({ key, number, text: whole });
  }
  return found;
}

/** Splits `text` into plain runs and task keys (for rendering keys as links). */
export function splitTaskKeys(text: string): ({ text: string } | { key: string; text: string })[] {
  const parts: ({ text: string } | { key: string; text: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(TASK_KEY_IN_TEXT)) {
    const at = match.index;
    const number = Number(match[2]);
    if (number < 1 || number > 2_147_483_647) continue;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ key: match[0], text: match[0] });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
