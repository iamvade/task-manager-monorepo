import { canDriveMeeting, type StandupDay, type StandupGroup } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useStartMeeting } from '../../../api/standups';
import { useAuth } from '../../../auth/useAuth';
import { NextIcon, PenIcon, PlayIcon, PrevIcon, SlidersIcon } from '../../../components/icons';
import { buttonVariants } from '../../../components/ui/buttonStyles';
import { Tooltip } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/cn';
import { useWorkspaceRole } from '../useStandup';
import { useDates } from '../../../lib/useDates';
import { GroupSwitcher, StandupHeader } from '../StandupHeader';
import { dayHref, writeHref } from './links';

const navButton = 'flex size-8 items-center justify-center rounded-[8px] text-3 hover:bg-hover';

/**
 * Group page header (Standup.dc.html): switcher, ‹ date › with a "Today" pill, then Group
 * settings, Write update (when I can still write today) and Start standup / Join live.
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
          {group.isMember && day && <MeetingButton day={day} />}
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

const liveButton =
  'flex h-9 items-center gap-2 rounded-[8px] px-3.5 text-[13px] font-medium no-underline max-sm:hidden';

/**
 * Live mode (a screen-shared meeting, so not on a phone). The person who drives it (the
 * facilitator, or admins in the group when there is none or they're out) gets Start standup;
 * while it runs, everyone else gets Join live. Nothing for groups without a meeting time, on
 * other days, or once the meeting has ended (its notes show on the page).
 */
function MeetingButton({ day }: { day: StandupDay }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const role = useWorkspaceRole();
  const navigate = useNavigate();
  const start = useStartMeeting(day.group.id, day.date);
  const meeting = day.meeting;
  const liveHref = `/standup/${day.group.id}/${day.date}/live`;
  const meets =
    day.group.meetingAt !== null &&
    day.date === day.today &&
    day.isStandupDay &&
    !day.group.archivedAt;
  if (!meets || !me || !role) return null;
  const facilitatorOut = day.members.some(
    (m) => m.user.id === day.group.facilitatorId && m.state === 'out',
  );
  const drives = canDriveMeeting(role, day.group.facilitatorId, facilitatorOut, me.user.id);

  if (meeting?.live) {
    return (
      <Link to={liveHref} className={cn(buttonVariants.primary, liveButton)}>
        <span aria-hidden className="size-2 rounded-full bg-white" />
        {t('standup.day.joinLive')}
      </Link>
    );
  }
  if (meeting || !drives) return null;
  return (
    <button
      type="button"
      disabled={start.isPending}
      onClick={() => {
        start.mutate(undefined, {
          onSuccess: () => {
            void navigate(liveHref);
          },
        });
      }}
      className={cn(buttonVariants.primary, liveButton, 'border-0 disabled:opacity-60')}
    >
      <PlayIcon size={14} />
      {t('standup.day.startStandup')}
    </button>
  );
}
