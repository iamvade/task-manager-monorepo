import { zonedTimeToZone, type StandupGroup } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { PenIcon, SlidersIcon, UserPlusIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { buttonVariants } from '../../components/ui/buttonStyles';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';
import { writeHref } from './day/links';
import { daysLabel, zoneLabel } from './format';
import { GroupSwitcher, StandupHeader } from './StandupHeader';

const outlineLink = cn(
  'flex h-9 items-center gap-1.5 rounded-[8px] border border-default bg-surface px-3 text-[13px] font-medium text-2 hover:bg-hover',
);

/**
 * A group nobody has posted in yet (StandupEmpty.dc.html): switcher + "New", the ghost-cards
 * illustration, members and schedule (in my own time zone), the two CTAs and "How it works".
 */
export function StandupEmptyView({
  group,
  groups,
}: {
  group: StandupGroup;
  groups: readonly StandupGroup[];
}) {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const viewerZone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  // Times are the group's wall clock; each member sees them in their own zone.
  const local = (time: string) =>
    zonedTimeToZone(group.today, time, group.timezone, viewerZone).time;
  const days = daysLabel(group.days, t);
  const zone = zoneLabel(viewerZone, i18n.language, t);
  const schedule = group.reminderAt
    ? t('standup.empty.scheduleReminder', { days, time: local(group.reminderAt), zone })
    : t('standup.empty.schedulePostBy', { days, time: local(group.postBy), zone });
  const settings = `/standup/${group.id}/settings`;

  return (
    <div className="flex min-h-full flex-col">
      <StandupHeader
        left={
          <>
            <GroupSwitcher group={group} groups={groups} icon={false} />
            <span className="flex h-[22px] items-center rounded-[11px] bg-success-soft px-2 text-[12px] font-semibold text-success-soft">
              {t('standup.empty.newBadge')}
            </span>
          </>
        }
        right={
          <Link to={settings} className={outlineLink}>
            <SlidersIcon size={14} />
            {t('standup.groupSettings')}
          </Link>
        }
      />
      <div className="flex flex-1 flex-col items-center px-6 pt-14 pb-12">
        <div className="flex w-full max-w-[600px] flex-col items-center gap-6 text-center">
          <Illustration />
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
              {t('standup.empty.title', { name: group.name })}
            </h1>
            <p className="m-0 text-[14px] leading-[22px] text-2">{t('standup.empty.body')}</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {group.members.length > 0 && (
              <div className="flex items-center pl-1.5">
                {group.members.slice(0, 6).map((m) => (
                  <Avatar
                    key={m.user.id}
                    user={m.user}
                    size={30}
                    ring
                    textSize={11}
                    className="-ml-1.5"
                  />
                ))}
              </div>
            )}
            <span className="text-[13px] text-2">
              {t('standup.empty.members', { count: group.members.length })}
            </span>
            <span className="flex h-6 items-center rounded-[12px] bg-surface-2 px-2.5 text-[12px] font-medium text-2">
              {schedule}
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {group.isMember && group.meetsToday && (
              <Link
                to={writeHref(group.id)}
                className={cn(
                  buttonVariants.primary,
                  'flex h-10 items-center gap-2 rounded-[8px] border-0 px-4 text-[14px] font-medium no-underline',
                )}
              >
                <PenIcon size={14} />
                {t('standup.empty.ctaWrite')}
              </Link>
            )}
            <Link
              to={`${settings}#members`}
              className={cn(outlineLink, 'h-10 gap-2 px-3.5 text-[14px]')}
            >
              <UserPlusIcon size={14} />
              {t('standup.empty.ctaInvite')}
            </Link>
          </div>

          <HowItWorks reminder={local(group.reminderAt ?? group.postBy)} />
        </div>
      </div>
    </div>
  );
}

function HowItWorks({ reminder }: { reminder: string }) {
  const { t } = useTranslation();
  const steps = [
    [t('standup.empty.step1'), t('standup.empty.step1Desc', { time: reminder })],
    [t('standup.empty.step2'), t('standup.empty.step2Desc')],
    [t('standup.empty.step3'), t('standup.empty.step3Desc')],
  ] as const;
  return (
    <section
      aria-labelledby="standup-how"
      className="mt-4 flex w-full flex-col gap-3 border-t border-subtle pt-6"
    >
      <h2 id="standup-how" className="m-0 text-[12px] font-medium text-muted">
        {t('standup.empty.how')}
      </h2>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2 p-0 text-left">
        {steps.map(([title, desc], i) => (
          <li
            key={title}
            className="flex flex-col gap-1.5 rounded-[10px] border border-subtle bg-subtle p-3"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-ink">
              {i + 1}
            </span>
            <span className="text-[13px] font-semibold">{title}</span>
            <span className="text-[12px] leading-4 text-muted">{desc}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Three ghost speech cards; the middle one dashed accent on accent-soft. */
function Illustration() {
  const line = 'block h-1.5 rounded-[3px]';
  return (
    <div aria-hidden="true" className="relative h-[140px] w-[300px]">
      <div className="absolute top-6 left-0 box-border flex w-[180px] flex-col gap-1.5 rounded-[12px] border border-default bg-surface p-3 text-left">
        <span className="flex items-center gap-1.5">
          <span className={cn('pal-fill size-5 rounded-full', paletteClass('avatar', 'rose'))} />
          <span className={cn(line, 'w-[60px] bg-[var(--border)]')} />
        </span>
        <span className={cn(line, 'w-[120px] bg-chip')} />
        <span className={cn(line, 'w-[90px] bg-chip')} />
      </div>
      <div className="absolute top-0 right-0 box-border flex w-[180px] flex-col gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-accent bg-accent-soft p-3 text-left">
        <span className="flex items-center gap-1.5">
          <span className={cn('pal-fill size-5 rounded-full', paletteClass('avatar', 'indigo'))} />
          <span className={cn(line, 'w-[50px] bg-accent opacity-40')} />
        </span>
        <span className={cn(line, 'w-[130px] bg-accent opacity-20')} />
        <span className={cn(line, 'w-[100px] bg-accent opacity-20')} />
      </div>
      <div className="absolute bottom-0 left-[60px] box-border flex w-[180px] flex-col gap-1.5 rounded-[12px] border border-default bg-surface p-3 text-left shadow-float">
        <span className="flex items-center gap-1.5">
          <span className={cn('pal-fill size-5 rounded-full', paletteClass('avatar', 'green'))} />
          <span className={cn(line, 'w-[70px] bg-[var(--border)]')} />
        </span>
        <span className={cn(line, 'w-[110px] bg-chip')} />
      </div>
    </div>
  );
}
