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
