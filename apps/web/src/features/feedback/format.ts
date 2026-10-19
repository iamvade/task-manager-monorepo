import { AVATAR_COLORS, type FeedbackDetail, type FeedbackType, type UserRef } from '@kite/shared';
import { useAuth } from '../../auth/useAuth';
import { formatDate } from '../../lib/dates';
import { useDates } from '../../lib/useDates';

export const typeColors = (type: FeedbackType) => ({
  background: `var(--fb-${type}-bg)`,
  color: `var(--fb-${type}-fg)`,
});

/** "Oct 19, 13:42" / "10-р сарын 19, 13:42" in the viewer's time zone. */
export function useDateTime() {
  const { me } = useAuth();
  const { locale, today } = useDates();
  const timeZone = me?.preferences.timezone;
  return (iso: string) => {
    const at = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    return `${formatDate(date, locale, today)}, ${part('hour')}:${part('minute')}`;
  };
}

/** Display name of a submitter: the name, else the email's local part. */
export function submitterName(item: { submitterName: string | null; email: string }) {
  const name = item.submitterName?.trim();
  if (name) return name;
  const local = item.email.split('@')[0] ?? '';
  return local === '' ? item.email : local;
}

/** Initials for the submitter avatar. */
export function submitterInitials(name: string) {
  const words = name.replace(/[.]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** "iPhone · iOS 17.4 · Safari 17.4". */
export const deviceLine = (detail: FeedbackDetail) =>
  [detail.device.device, detail.device.os, detail.device.browser].filter(Boolean).join(' · ');

/** A stable avatar color for a submitter (no account, so derived from the email). */
export function submitterUser(detail: Pick<FeedbackDetail, 'submitterName' | 'email'>) {
  const name = submitterName(detail);
  let hash = 0;
  for (const ch of detail.email) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    name,
    initials: submitterInitials(name),
    avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? 'neutral',
  } satisfies Pick<UserRef, 'name' | 'initials' | 'avatarColor'>;
}
