import { isAway, type WorkspaceMember } from '@kite/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { useDates } from '../../lib/useDates';

/**
 * The hint next to a person in pickers and @-suggestions: "You", "Away until Oct 20" while they
 * are out of office, else their job title.
 */
export function useMemberHint() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { today, formatDate } = useDates();
  const meId = me?.user.id;
  return useCallback(
    (member: Pick<WorkspaceMember, 'user' | 'title' | 'awayUntil'>): string | null => {
      if (member.user.id === meId) return t('create.you');
      if (isAway(member, today) && member.awayUntil) {
        return t('picker.awayUntil', { date: formatDate(member.awayUntil) });
      }
      return member.title;
    },
    [meId, t, today, formatDate],
  );
}
