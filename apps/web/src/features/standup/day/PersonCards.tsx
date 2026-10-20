import { shortName, type StandupDayMember } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { buttonVariants } from '../../../components/ui/buttonStyles';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { useDayView } from './DayContext';
import { writeHref } from './links';
import { useWsPath } from '../../../api/workspaces';

/** Me, not posted yet (Standup.dc.html dashed card) with Write update. */
export function MyPlaceholderCard({ hint }: { hint: string | null }) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { me, day } = useDayView();
  return (
    <div className="box-border flex items-center gap-3 rounded-[12px] border-[1.5px] border-dashed border-strong bg-subtle p-4">
      <Avatar user={me} size={36} textSize={13} title={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{t('standup.day.youNotYet')}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </div>
      <Link
        to={ws(writeHref(day.group.id))}
        className={cn(
          buttonVariants.primary,
          'flex h-8 flex-none items-center rounded-[8px] px-3 text-[13px] font-medium no-underline',
        )}
      >
        {t('standup.day.writeUpdate')}
      </Link>
    </div>
  );
}

/** Someone out of office that day: grey avatar, "Out of office · back Oct 12", "Out" chip. */
export function OutCard({ member }: { member: StandupDayMember }) {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  return (
    <div className="box-border flex items-center gap-3 rounded-[12px] border border-subtle bg-subtle p-4">
      <span
        aria-hidden="true"
        className="flex size-9 flex-none items-center justify-center rounded-full bg-out-avatar text-[13px] font-semibold text-3"
      >
        {member.user.initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-3">{shortName(member.user.name)}</span>
        <span className="text-[12px] text-muted">
          {member.backOn
            ? t('standup.day.outUntil', { date: formatDate(member.backOn) })
            : t('standup.day.outOfOffice')}
        </span>
      </div>
      <span className="flex h-[22px] flex-none items-center rounded-[11px] bg-out-avatar px-2 text-[12px] font-semibold text-3">
        {t('standup.day.out')}
      </span>
    </div>
  );
}
