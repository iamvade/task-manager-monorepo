import { weekdayIndex, type Locale } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/useAuth';
import { dueTone, formatDate, formatRange, relativeDay, todayFor, type DueTone } from './dates';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const MONTHS = [
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'm6',
  'm7',
  'm8',
  'm9',
  'm10',
  'm11',
  'm12',
] as const;

/** Templates under `calendar.format` that show one day (with its weekday, or "Oct 1"). */
type DayTemplate = 'dateShort' | 'weekdayShortDate' | 'weekdayLongDate' | 'weekdayLongDateFull';

/** Date helpers bound to the UI language and today in the user's time zone. */
export function useDates() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const locale: Locale = i18n.language === 'en' ? 'en' : 'mn';
  const today = todayFor(me?.preferences.timezone);

  const formatDay = (template: DayTemplate, date: string) => {
    const [, m = 1, d = 1] = date.split('-').map(Number);
    const weekday = WEEKDAYS[weekdayIndex(date)] ?? 'mon';
    const month = MONTHS[m - 1] ?? 'm1';
    return t(`calendar.format.${template}`, {
      weekdayShort: t(`calendar.weekdays.short.${weekday}`),
      weekdayLong: t(`calendar.weekdays.long.${weekday}`),
      monthShort: t(`calendar.months.short.${month}`),
      monthLong: t(`calendar.months.long.${month}`),
      m,
      d,
    });
  };

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
    formatWeekday: (date: string) => formatDay('weekdayShortDate', date),
    /** A `calendar.format.*` template filled with every part of `date`. */
    formatDay: (template: DayTemplate, date: string) => formatDay(template, date),
  };
}
