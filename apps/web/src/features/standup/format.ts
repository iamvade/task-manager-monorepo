import { utcOffsetLabel } from '@kite/shared';
import type { TFunction } from 'i18next';

/** i18n keys of `standup.weekdays`, Monday = 0 … Sunday = 6 (`standup_groups.days`). */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** "Mon–Fri" / "Даваа–Баасан" for a run of 3+ consecutive days, else "Mon, Wed, Fri". */
export function daysLabel(days: readonly number[], t: TFunction): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const key = (d: number) => WEEKDAY_KEYS[d] ?? 'mon';
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return '';
  if (sorted.length >= 3 && last - first === sorted.length - 1) {
    return t('standup.daysRange', {
      from: t(`standup.weekdays.${key(first)}.range`),
      to: t(`standup.weekdays.${key(last)}.range`),
    });
  }
  return sorted.map((d) => t(`standup.weekdays.${key(d)}.short`)).join(', ');
}

/** Localized city names for the zones the designs show; others use the IANA city. */
const MN_CITIES: Record<string, string> = {
  'Asia/Ulaanbaatar': 'Улаанбаатар',
  'Asia/Hovd': 'Ховд',
  'Asia/Choibalsan': 'Чойбалсан',
  'Asia/Seoul': 'Сөүл',
  'Asia/Tokyo': 'Токио',
  'Asia/Shanghai': 'Бээжин',
};

/** "Ulaanbaatar (UTC+8)" / "Улаанбаатар (UTC+8)". */
export function zoneLabel(timeZone: string, locale: string, t: TFunction, at = new Date()): string {
  const offset = utcOffsetLabel(timeZone, at);
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 'UTC';
  const city =
    (locale === 'mn' ? MN_CITIES[timeZone] : undefined) ??
    (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ');
  return t('standup.zone', { city, offset });
}
