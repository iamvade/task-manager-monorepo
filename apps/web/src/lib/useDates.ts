import { weekdayIndex, type Locale } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/useAuth';
import { dueTone, formatDate, formatRange, relativeDay, todayFor, type DueTone } from './dates';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'] as const;

/** Date helpers bound to the UI language and today in the user's time zone. */
export function useDates() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const locale: Locale = i18n.language === 'en' ? 'en' : 'mn';
  const today = todayFor(me?.preferences.timezone);

  return {
    locale,
    today,
    formatDate: (date: string) => formatDate(date, locale, today),
    formatRange: (start: string, end: string) => formatRange(start, end, locale, today),
    /** "Today" / "Tomorrow" (translated), otherwise the short date. */
    formatDue: (date: string) => {
      const rel = relativeDay(date, today);
      if (rel === 'today') return t('dates.today');
      if (rel === 'tomorrow') return t('dates.tomorrow');
      return formatDate(date, locale, today);
    },
    dueTone: (date: string, done?: boolean): DueTone => dueTone(date, today, done),
    /** "Thu, Oct 8" / "10-р сарын 8, Пү" (picker hints). */
    formatWeekday: (date: string) => {
      const [, m = 1, d = 1] = date.split('-').map(Number);
      return t('calendar.format.weekdayShortDate', {
        weekdayShort: t(`calendar.weekdays.short.${WEEKDAYS[weekdayIndex(date)] ?? 'mon'}`),
        monthShort: t(`calendar.months.short.${MONTHS[m - 1] ?? 'm1'}`),
        m,
        d,
      });
    },
  };
}
