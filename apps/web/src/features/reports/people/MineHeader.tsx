import type { PersonReport, ReportPeriod } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { CommentIcon, LockIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { InsightBox } from '../ui/InsightBox';

/**
 * My performance header (ReportsMine.dc.html): 44px avatar, the period as a friendly title
 * ("Your last 4 weeks"), "name · job title · range", the privacy pill and the accent note.
 */
export function MineHeader({
  person,
  period,
  range,
}: {
  person: PersonReport['person'];
  period: ReportPeriod;
  range: string;
}) {
  const { t } = useTranslation();
  const k = 'reports.person.mine';
  const line = [person.user.name, person.title, range].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3.5">
        <Avatar user={person.user} size={44} textSize={15} title={null} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {t(`${k}.titles.${period}`)}
          </h2>
          <span className="text-[13px] text-muted">{line}</span>
        </div>
        <span className="flex-1" />
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[12px] font-medium text-3">
          <LockIcon size={12} className="flex-none" />
          {t(`${k}.privacy`)}
        </span>
      </div>
      <InsightBox icon={<CommentIcon size={16} className="mt-0.5 flex-none text-accent-ink" />}>
        {t(`${k}.note`)}
      </InsightBox>
    </div>
  );
}
