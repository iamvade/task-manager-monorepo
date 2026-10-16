import type { StandupDayMember } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CheckIcon } from '../../../components/icons';
import { Tooltip } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/cn';
import { mnFrom } from '../../../lib/mn';
import { paletteClass } from '../../../lib/palette';
import { firstName, useDayView } from './DayContext';
import { writeHref } from './links';

/**
 * "Who has posted" (Standup.dc.html): the count (out of office left out), the due / meeting
 * times in my zone, one 64px column per member, and "Your turn" while I can still post.
 */
export function PostedStrip({ yourTurn }: { yourTurn: boolean }) {
  const { t, i18n } = useTranslation();
  const { day, clock, postBy } = useDayView();
  const meeting = day.meetingAt ? clock(day.meetingAt) : null;
  const count = t('standup.day.postedCount', {
    count: day.postedCount,
    // "5-аас 4 нь бичсэн": the Mongolian total carries its "from" suffix.
    total: i18n.language === 'mn' ? mnFrom(day.expectedCount) : day.expectedCount,
  });
  return (
    <section
      aria-label={t('standup.day.whoPosted')}
      className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[12px] border border-default px-4 py-3.5"
    >
      <div className="flex min-w-[160px] flex-col gap-0.5">
        <span className="text-[14px] font-semibold">
          {day.expectedCount === 0 && day.members.length > 0 ? t('standup.day.everyoneOut') : count}
        </span>
        <span className="text-[12px] text-muted">
          {meeting
            ? t('standup.day.dueByMeeting', { time: postBy, meeting })
            : t('standup.day.dueBy', { time: postBy })}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 max-sm:gap-x-2 max-sm:gap-y-3">
        {day.members.map((m) => (
          <StripMember key={m.user.id} member={m} />
        ))}
      </ul>
      <span className="flex-1" />
      {yourTurn && (
        <Link
          to={writeHref(day.group.id)}
          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-accent-soft px-3 text-[13px] font-semibold text-accent-ink no-underline hover:brightness-95"
        >
          {t('standup.day.yourTurn')}
        </Link>
      )}
    </section>
  );
}

function StripMember({ member: m }: { member: StandupDayMember }) {
  const { t } = useTranslation();
  const { me, day, clock, postBy } = useDayView();
  const mine = m.user.id === me.id;
  // On a past day "not yet" can't change any more.
  const notYet = day.date === day.today ? t('standup.day.notYet') : t('standup.day.noUpdate');
  const time = m.postedAt ? clock(m.postedAt) : null;
  const state =
    m.state === 'posted' && time
      ? m.isLate
        ? t('standup.day.postedLateTitle', { time, postBy })
        : t('standup.day.postedTitle', { time })
      : m.state === 'out'
        ? t('standup.day.out')
        : notYet;
  return (
    <Tooltip content={`${m.user.name} · ${state}`}>
      {(props) => (
        <li
          {...props}
          tabIndex={0}
          aria-label={`${mine ? t('standup.day.you') : m.user.name} · ${state}`}
          className="flex w-16 flex-col items-center gap-1 rounded-[8px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative box-border flex size-9 items-center justify-center rounded-full text-[12px] font-semibold',
              m.state === 'posted' && cn('pal-fill', paletteClass('avatar', m.user.avatarColor)),
              m.state === 'not_yet' &&
                'border-[1.5px] border-dashed border-[color:var(--text-faint)] bg-surface text-3',
              m.state === 'out' && 'bg-out-avatar text-3',
            )}
          >
            {m.user.initials}
            {m.state === 'posted' && (
              <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-success text-white shadow-[0_0_0_2px_var(--bg)]">
                <CheckIcon size={8} strokeWidth={4} />
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'max-w-full truncate text-center text-[12px] leading-[14px]',
              m.state === 'out' ? 'text-muted' : 'text-2',
            )}
          >
            {mine ? t('standup.day.you') : firstName(m.user)}
          </span>
          <span aria-hidden="true" className="text-[11px] leading-[14px]">
            {m.state === 'posted' && time ? (
              <span className="text-muted">
                {time}
                {m.isLate && <span className="text-warning"> · {t('standup.day.late')}</span>}
              </span>
            ) : m.state === 'out' ? (
              <span className="rounded-[8px] bg-surface-2 px-1.5 font-semibold text-3">
                {t('standup.day.out')}
              </span>
            ) : (
              <span
                className={cn(
                  'font-semibold',
                  day.date === day.today ? 'text-accent-ink' : 'text-muted',
                )}
              >
                {notYet}
              </span>
            )}
          </span>
        </li>
      )}
    </Tooltip>
  );
}
