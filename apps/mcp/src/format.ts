/**
 * Tool results as compact text. Anything people typed into Kite (titles aside: descriptions,
 * comments, notification snippets) is fenced in `<user_content>` so Claude reads it as data,
 * never as instructions to follow.
 */
import type { MyTask, TaskListItem, UserRef } from '@kite/shared';
import { statusLabel } from './resolve.js';

/**
 * One line of text people typed (titles, names): whitespace runs, newlines included, become one
 * space, so a title can't forge extra lines or headings in a tool result.
 */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

const names = (people: readonly UserRef[]) =>
  people.length ? people.map((p) => oneLine(p.name)).join(', ') : 'unassigned';

/** Text people wrote, fenced; a closing tag inside it can't end the fence early. */
export function userContent(text: string, source: string): string {
  const safe = text.replace(/<\/?user_content/gi, (m) => m.replace('<', '‹'));
  const label = source.replace(/["<>]/g, '');
  return `<user_content source="${label}">\n${safe}\n</user_content>`;
}

/** One task as a line: `APP-142 · Title · In Review · high · due 2026-11-14 · Anu, Bat`. */
export function taskLine(
  task: Pick<TaskListItem | MyTask, 'key' | 'title' | 'status' | 'priority' | 'dueDate'> & {
    assignees: readonly UserRef[];
  },
): string {
  const parts = [task.key, oneLine(task.title), oneLine(statusLabel(task.status))];
  if (task.priority !== 'none') parts.push(task.priority);
  if (task.dueDate) parts.push(`due ${task.dueDate}`);
  parts.push(names(task.assignees));
  return parts.join(' · ');
}

export function section(title: string, lines: readonly string[], empty = 'none'): string {
  return `## ${title}\n${lines.length ? lines.map((l) => `- ${l}`).join('\n') : empty}`;
}

export { names };
