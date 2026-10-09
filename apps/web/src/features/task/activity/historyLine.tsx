import { shortName, type HistoryEntry, type StatusSnapshot } from '@kite/shared';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { StatusPill } from '../../../components/ui/StatusPill';

/** i18n key (under `drawer.history`) + values of one history sentence. */
export interface HistoryLine {
  key: HistoryKey;
  values: Record<string, string>;
  /** Status pills for `<from>` / `<to>`. */
  from?: StatusSnapshot;
  to?: StatusSnapshot;
}

export type HistoryKey =
  | 'created'
  | 'duplicated'
  | 'titleChanged'
  | 'descriptionChanged'
  | 'statusChanged'
  | 'statusSet'
  | 'prioritySet'
  | 'priorityChanged'
  | 'dueSet'
  | 'dueChanged'
  | 'dueCleared'
  | 'startSet'
  | 'startChanged'
  | 'startCleared'
  | 'sprintSet'
  | 'sprintCleared'
  | 'assigneeAdded'
  | 'assigneeRemoved'
  | 'tagAdded'
  | 'tagRemoved'
  | 'subtaskAdded'
  | 'subtaskCompleted'
  | 'attached'
  | 'attachmentRemoved'
  | 'projectChanged'
  | 'deleted'
  | 'restored';

interface Formatters {
  t: TFunction;
  formatDate: (date: string) => string;
}

/**
 * The sentence for one history entry. `previousStatus` is the status the feed last showed: a
 * change away from it reads "changed status to <to>" (TaskDetail.dc.html), otherwise the long
 * "from <from> to <to>" form.
 */
export function historyLine(
  entry: HistoryEntry,
  { t, formatDate }: Formatters,
  previousStatus?: string,
): HistoryLine | null {
  const actor = shortName(entry.actor.name);
  const v = (values: Record<string, string> = {}) => ({ actor, ...values });
  const dateChange = (
    kind: 'due' | 'start',
    { from, to }: { from: string | null; to: string | null },
  ): HistoryLine => {
    if (!to) return { key: `${kind}Cleared`, values: v() };
    if (!from) return { key: `${kind}Set`, values: v({ to: formatDate(to) }) };
    return {
      key: `${kind}Changed`,
      values: v({ from: formatDate(from), to: formatDate(to) }),
    };
  };
  const statusName = (s: StatusSnapshot) => s.name ?? t(`status.${s.category}`);

  switch (entry.type) {
    case 'task.created':
      return entry.payload.duplicateOf
        ? { key: 'duplicated', values: v({ key: entry.payload.duplicateOf.key }) }
        : { key: 'created', values: v() };
    case 'title.changed':
      return { key: 'titleChanged', values: v({ to: entry.payload.to }) };
    case 'description.changed':
      return { key: 'descriptionChanged', values: v() };
    case 'status.changed': {
      const { from, to } = entry.payload;
      const values = v({ from: statusName(from), to: statusName(to) });
      return from.id === previousStatus
        ? { key: 'statusSet', values, to }
        : { key: 'statusChanged', values, from, to };
    }
    case 'priority.changed': {
      const { from, to } = entry.payload;
      return from === 'none'
        ? { key: 'prioritySet', values: v({ to: t(`priority.${to}`) }) }
        : {
            key: 'priorityChanged',
            values: v({ from: t(`priority.${from}`), to: t(`priority.${to}`) }),
          };
    }
    case 'due.changed':
      return dateChange('due', entry.payload);
    case 'start.changed':
      return dateChange('start', entry.payload);
    case 'sprint.changed': {
      const { from, to } = entry.payload;
      if (to) return { key: 'sprintSet', values: v({ to: to.name }) };
      return from ? { key: 'sprintCleared', values: v({ from: from.name }) } : null;
    }
    case 'assignee.added':
      return { key: 'assigneeAdded', values: v({ name: shortName(entry.payload.user.name) }) };
    case 'assignee.removed':
      return { key: 'assigneeRemoved', values: v({ name: shortName(entry.payload.user.name) }) };
    case 'tag.added':
      return { key: 'tagAdded', values: v({ name: entry.payload.tag.name }) };
    case 'tag.removed':
      return { key: 'tagRemoved', values: v({ name: entry.payload.tag.name }) };
    case 'subtask.added':
      return { key: 'subtaskAdded', values: v({ title: entry.payload.subtask.title }) };
    case 'subtask.completed':
      return { key: 'subtaskCompleted', values: v({ title: entry.payload.subtask.title }) };
    case 'attachment.added':
      return { key: 'attached', values: v({ filename: entry.payload.attachment.filename }) };
    case 'attachment.removed':
      return {
        key: 'attachmentRemoved',
        values: v({ filename: entry.payload.attachment.filename }),
      };
    case 'project.changed':
      return {
        key: 'projectChanged',
        values: v({ from: entry.payload.from.name, to: entry.payload.to.name }),
      };
    case 'task.deleted':
      return { key: 'deleted', values: v() };
    case 'task.restored':
      return { key: 'restored', values: v() };
    case 'comment.added':
      return null;
  }
}

/**
 * The 8px marker before a history line: grey by default; In Review = accent, Done / completed
 * subtask = green, Urgent = red (the colored markers in TaskDetail.dc.html).
 */
export function historyMarker(entry: HistoryEntry): string {
  if (entry.type === 'status.changed') {
    if (entry.payload.to.category === 'review') return 'var(--status-review)';
    if (entry.payload.to.category === 'done') return 'var(--status-done)';
  }
  if (entry.type === 'priority.changed' && entry.payload.to === 'urgent') {
    return 'var(--prio-urgent)';
  }
  if (entry.type === 'subtask.completed') return 'var(--status-done)';
  return 'var(--project-dot-inactive)';
}

/** `<Trans components>` for a line: bold names, status pills. */
export function lineComponents(line: HistoryLine): Record<string, ReactElement> {
  return {
    b: <strong className="font-semibold text-default" />,
    from: line.from ? <StatusPill category={line.from.category} /> : <span />,
    to: line.to ? <StatusPill category={line.to.category} /> : <span />,
  };
}
