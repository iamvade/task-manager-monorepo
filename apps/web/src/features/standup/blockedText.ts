import type { TaskBlocked } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useDates } from '../../lib/useDates';
import { firstName } from './day/DayContext';

/** The standup day the blocker was posted on (inside the workspace: prefix with `useWsPath()`). */
export const blockedHref = (blocked: TaskBlocked) => `/standup/${blocked.groupId}/${blocked.date}`;

/**
 * Texts of the "Blocked" marker. Outside the group the blocker text and author are redacted
 * (`text`/`fromUser` null), so it names the group instead.
 */
export function useBlockedText() {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  return (blocked: TaskBlocked) => {
    const date = formatDate(blocked.date);
    const name = blocked.fromUser ? firstName(blocked.fromUser) : null;
    const source = name
      ? t('task.blocked.source', { name, date })
      : t('task.blocked.sourceGroup', { group: blocked.groupName, date });
    return {
      /** "Waiting on final tab icons — from Temuulen's standup, Oct 9". */
      title:
        blocked.text && name
          ? t('task.blocked.tooltip', { text: blocked.text, name, date })
          : t('task.blocked.redacted', { group: blocked.groupName, date }),
      /** "From Temuulen's standup, Oct 9" (the Board row's title, the drawer link). */
      source,
      /** The Board row after "Blocked ·": the blocker text, or where it comes from. */
      detail: blocked.text ?? t('task.blocked.fromGroup', { group: blocked.groupName }),
    };
  };
}
