import { shortName, zonedTimeToZone, type StandupDay, type StandupGroup } from '@kite/shared';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWsPath } from '../../api/workspaces';
import { standupDayQuery, useStandupGroups } from '../../api/standups';
import { useAuth } from '../../auth/useAuth';
import { StandupIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { buttonVariants } from '../../components/ui/buttonStyles';
import { cn } from '../../lib/cn';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { mnFrom } from '../../lib/mn';
import { formatClock } from '../../lib/relativeTime';
import { writeHref } from '../standup/day/links';
import { waitingForMe } from '../standup/useStandup';

/**
 * "Post your standup update" (MyTasks.dc.html, right column): on a standup day, for each of my
 * groups still waiting for my update. Several groups share one card.
 */
export function StandupCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const groups = useStandupGroups(workspaceId);
  const waiting = waitingForMe(groups.data);
  const days = useQueries({
    queries: waiting.map((g) => standupDayQuery(g.id, 'today')),
  });
  if (waiting.length === 0) return null;
  return (
    <section
      aria-labelledby="standup-card"
      className="box-border flex flex-col gap-3 rounded-[12px] border border-default bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink"
        >
          <StandupIcon size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="standup-card" className="m-0 text-[14px] leading-5 font-semibold">
            {t('myTasks.standup.title')}
          </h2>
          {waiting.length === 1 && waiting[0] && (
            <GroupMeta group={waiting[0]} day={days[0]?.data} />
          )}
        </div>
      </div>
      {waiting.map((group, i) => (
        <GroupBlock key={group.id} group={group} day={days[i]?.data} divided={waiting.length > 1} />
      ))}
    </section>
  );
}

function GroupMeta({
  group,
  day,
  named = false,
}: {
  group: StandupGroup;
  day: StandupDay | undefined;
  named?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const time = day
    ? formatClock(new Date(day.postByAt), zone)
    : zonedTimeToZone(group.today, group.postBy, group.timezone, zone).time;
  const parts = [
    ...(named ? [] : [group.name]),
    t('standup.write.dueBy', { time }),
    ...(day
      ? [
          t('standup.day.postedCount', {
            count: day.postedCount,
            total: i18n.language === 'mn' ? mnFrom(day.expectedCount) : day.expectedCount,
          }),
        ]
      : []),
  ];
  return <span className="text-[12px] leading-[18px] text-muted">{parts.join(' · ')}</span>;
}

function GroupBlock({
  group,
  day,
  divided,
}: {
  group: StandupGroup;
  day: StandupDay | undefined;
  divided: boolean;
}) {
  const { t } = useTranslation();
  const ws = useWsPath();
  const { me } = useAuth();
  const posted = (day?.members ?? []).filter(
    (m) => m.state === 'posted' && m.user.id !== me?.user.id,
  );
  const names = posted.map((m) => shortName(m.user.name).split(' ')[0] ?? m.user.name);
  const label = [
    names.length > 0 ? t('myTasks.standup.postedBy', { names: names.join(', ') }) : null,
    t('myTasks.standup.notYetYou'),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cn('flex flex-col gap-3', divided && 'border-t border-subtle pt-3')}>
      {divided && (
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold">{group.name}</span>
          <GroupMeta group={group} day={day} named />
        </div>
      )}
      <div role="img" aria-label={label} className="flex items-center">
        {posted.slice(0, 6).map((m) => (
          <Avatar
            key={m.user.id}
            user={m.user}
            size={24}
            ring="surface"
            title={null}
            className="-mr-1.5"
          />
        ))}
        {me && (
          <span
            aria-hidden="true"
            className={cn(
              'box-border flex size-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-[color:var(--text-faint)] text-[10px] font-semibold text-muted',
              posted.length > 0 && 'ml-3.5',
            )}
          >
            {me.user.initials}
          </span>
        )}
        <span aria-hidden="true" className="ml-2 text-[12px] text-muted">
          {t('standup.day.you')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={ws(writeHref(group.id))}
          className={cn(
            buttonVariants.primary,
            'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium no-underline',
          )}
        >
          {t('standup.day.writeUpdate')}
        </Link>
        <Link
          to={ws(`/standup/${group.id}`)}
          className="inline-flex h-8 items-center rounded-[8px] px-2.5 text-[13px] font-medium text-2 no-underline hover:bg-hover"
        >
          {t('myTasks.standup.seeTeam')}
        </Link>
      </div>
    </div>
  );
}
