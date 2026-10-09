import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/useAuth';
import { formatDate } from './dates';
import { fileSize, relativeTime } from './relativeTime';
import { useDates } from './useDates';

/** `relativeTime` / `fileSize` translated for the UI language and the user's time zone. */
export function useRelativeTime() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { locale, today } = useDates();
  const timeZone = me?.preferences.timezone;

  return {
    /**
     * "Just now", "2 hours ago", "Yesterday, 4:12 PM", "Oct 1". `inline` lower-cases the first
     * letter of "Just now" / "Yesterday" for use mid-sentence ("Updated just now").
     */
    ago: (iso: string, { inline = false, now = new Date() } = {}) => {
      const rel = relativeTime(iso, now, timeZone, locale);
      const lower = (text: string) =>
        inline ? text.charAt(0).toLocaleLowerCase() + text.slice(1) : text;
      switch (rel.kind) {
        case 'justNow':
          return lower(t('drawer.time.justNow'));
        case 'minutes':
          return t('drawer.time.minutesAgo', { count: rel.count });
        case 'hours':
          return t('drawer.time.hoursAgo', { count: rel.count });
        case 'yesterday':
          return lower(t('drawer.time.yesterdayAt', { time: rel.time }));
        case 'date':
          return formatDate(rel.date, locale, today);
      }
    },
    /** "248 KB". */
    size: (bytes: number) => {
      const { unit, value } = fileSize(bytes);
      return t(`drawer.size.${unit}`, { value });
    },
  };
}
