import type { Locale } from '@kite/shared';
import { format, parseISO } from 'date-fns';
import type { TFunction } from 'i18next';

/** Week start on a chart axis: "Jul 20" / "7/20" (design-notes A.4). */
export function weekLabel(date: string, locale: Locale): string {
  if (locale === 'en') return format(parseISO(date), 'MMM d');
  const [, m = 1, d = 1] = date.split('-').map(Number);
  return `${String(m)}/${String(d)}`;
}

/** Days to one decimal ("4.6"); "—" when there is no value. */
export const formatDays = (days: number | null): string => (days === null ? '—' : days.toFixed(1));

/** Median reply delay: "<1h", "2h" / "2ц", then days ("1.5 days"). */
export function formatReplyTime(t: TFunction, hours: number): string {
  if (hours < 1) return t('reports.person.helping.underHour');
  if (hours < 24) return t('reports.person.helping.hours', { count: Math.round(hours) });
  const days = Math.round((hours / 24) * 10) / 10;
  return t('reports.delta.days', { count: days, value: days.toFixed(1) });
}

export { mnFrom } from '../../lib/mn';
