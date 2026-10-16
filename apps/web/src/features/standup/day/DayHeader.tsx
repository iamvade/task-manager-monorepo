import type { StandupDay, StandupGroup } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { NextIcon, PenIcon, PlayIcon, PrevIcon, SlidersIcon } from '../../../components/icons';
import { buttonVariants } from '../../../components/ui/buttonStyles';
import { Tooltip } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { GroupSwitcher, StandupHeader } from '../StandupHeader';
import { dayHref, writeHref } from './links';

const navButton = 'flex size-8 items-center justify-center rounded-[8px] text-3 hover:bg-hover';

/**
 * Group page header (Standup.dc.html): switcher, ‹ date › with a "Today" pill, then Group
 * settings, Write update (when I can still write today) and Start standup (live mode: later).
 */
export function DayHeader({
  group,
  groups,
  day,
  canWrite,
  posted,
}: {
  group: StandupGroup;
  groups: readonly StandupGroup[];
  /** Null while the day loads or for people outside the group. */
  day: StandupDay | null;
  canWrite: boolean;
  posted: boolean;
}) {
  const { t } = useTranslation();
  const { formatDay } = useDates();
  const date = day?.date ?? group.today;
  const isToday = date === (day?.today ?? group.today);
  const prev = day?.prevDate ?? null;
  const next = day?.nextDate ?? null;
  return (
    <StandupHeader
      left={
        <>
          <GroupSwitcher group={group} groups={groups} />
          {day && (
            <div className="flex items-center gap-0.5">
              {prev ? (
                <Link
                  to={dayHref(group.id, prev, day.today)}
                  aria-label={t('standup.day.prevDay')}
                  className={navButton}
                >
                  <PrevIcon size={16} />
                </Link>
              ) : (
                <DisabledNav label={t('standup.day.prevDay')} icon={<PrevIcon size={16} />} />
              )}
              <h1 className="m-0 min-w-[168px] text-center text-[14px] font-medium max-sm:min-w-0 max-sm:px-1">
                {formatDay('weekdayLongDate', date)}
              </h1>
              {next ? (
                <Link
                  to={dayHref(group.id, next, day.today)}
                  aria-label={t('standup.day.nextDay')}
                  className={navButton}
                >
                  <NextIcon size={16} />
                </Link>
              ) : (
                <DisabledNav label={t('standup.day.nextDay')} icon={<NextIcon size={16} />} />
              )}
              {isToday && (
                <span className="ml-0.5 flex h-[22px] items-center rounded-[11px] bg-surface-2 px-2 text-[12px] font-medium text-3">
                  {t('standup.day.today')}
                </span>
              )}
            </div>
          )}
        </>
      }
      right={
        <>
          <Tooltip content={t('standup.groupSettings')}>
            {(props) => (
              <Link
                {...props}
                to={`/standup/${group.id}/settings`}
                aria-label={t('standup.groupSettings')}
                className="flex size-9 items-center justify-center rounded-[8px] text-3 hover:bg-hover"
              >
                <SlidersIcon size={16} />
              </Link>
            )}
          </Tooltip>
          {canWrite && (
            <Link
              to={writeHref(group.id)}
              className="flex h-9 items-center gap-1.5 rounded-[8px] border border-default bg-surface px-3 text-[13px] font-medium text-default no-underline hover:bg-hover"
            >
              <PenIcon size={14} />
              {posted ? t('standup.day.editUpdate') : t('standup.day.writeUpdate')}
            </Link>
          )}
          {group.isMember && (
            <>
              {/* Live mode comes later; drawn so the header matches the design. */}
              <Tooltip content={t('standup.day.startSoon')}>
                {(props) => (
                  <button
                    {...props}
                    type="button"
                    aria-disabled="true"
                    aria-describedby="standup-start-soon"
                    className={cn(
                      buttonVariants.primary,
                      // Live mode is a screen-shared meeting: not offered on a phone.
                      'flex h-9 cursor-not-allowed items-center gap-2 rounded-[8px] border-0 px-3.5 text-[13px] font-medium opacity-60 max-sm:hidden',
                    )}
                  >
                    <PlayIcon size={14} />
                    {t('standup.day.startStandup')}
                  </button>
                )}
              </Tooltip>
              <span id="standup-start-soon" className="sr-only">
                {t('standup.day.startSoon')}
              </span>
            </>
          )}
        </>
      }
    />
  );
}

function DisabledNav({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-label={label}
      className="flex size-8 cursor-not-allowed items-center justify-center rounded-[8px] text-3 opacity-40"
    >
      {icon}
    </button>
  );
}
