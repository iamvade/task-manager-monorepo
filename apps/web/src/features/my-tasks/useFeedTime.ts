import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { formatDate } from '../../lib/dates';
import { relativeTime } from '../../lib/relativeTime';
import { useDates } from '../../lib/useDates';

/** "Just now" · "2h ago" · "Yesterday" · "Oct 6" (MyTasks.dc.html feed times). */
export function useFeedTime() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { locale, today } = useDates();
  return (iso: string) => {
    const rel = relativeTime(iso, new Date(), me?.preferences.timezone, locale);
    switch (rel.kind) {
      case 'justNow':
        return t('drawer.time.justNow');
      case 'minutes':
        return t('myTasks.time.minutesAgo', { count: rel.count });
      case 'hours':
        return t('myTasks.time.hoursAgo', { count: rel.count });
      case 'yesterday':
        return t('myTasks.time.yesterday');
      case 'date':
        return formatDate(rel.date, locale, today);
    }
  };
}
