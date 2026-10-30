import type { PersonReport, ReportPeriod } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CommentIcon, MentionIcon, SubtaskIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { formatReplyTime } from '../format';
import { Panel, PanelHeading } from '../ui/Panel';
import { variantKeys, type PersonVariant } from './copy';

type Helping = PersonReport['helping'];

/**
 * Helping others / How you helped others (ReportsPeople.dc.html): three tiles (comments,
 * subtasks, mentions answered) and the "Worked with most" list, for the selected period.
 */
export function HelpingPanel({
  helping,
  variant,
  period,
  range,
}: {
  helping: Helping;
  variant: PersonVariant;
  period: ReportPeriod;
  range: string;
}) {
  const { t } = useTranslation();
  const k = variantKeys(variant);
  const h = 'reports.person.helping';
  const { comments, subtasks, mentions, workedWith } = helping;
  const periodPhrase = period === 'custom' ? range : t(`${h}.periods.${period}`);

  let mentionsSub: string;
  if (mentions.total === 0) mentionsSub = t(`${h}.noMentions`);
  else if (mentions.medianReplyHours === null) mentionsSub = t(`${h}.notAnswered`);
  else {
    const time = formatReplyTime(t, mentions.medianReplyHours);
    mentionsSub =
      variant === 'me' && mentions.answered === mentions.total
        ? t('reports.person.mine.allAnswered', { time })
        : t(`${h}.medianReply`, { time });
  }

  return (
    <Panel labelledBy="person-helping" className="gap-4 px-5 py-4">
      <PanelHeading
        id="person-helping"
        title={t(`${k}.helping`)}
        sub={t(`${k}.helpingSub`, { period: periodPhrase })}
        size={14}
      />
      <div className="flex flex-wrap gap-6">
        <div className="grid min-w-0 flex-[2_1_480px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <HelpTile
            icon={<CommentIcon size={16} />}
            label={t(`${k}.comments`)}
            value={comments.current}
            sub={t(`${k}.prev`, { value: String(comments.previous) })}
          />
          <HelpTile
            icon={<SubtaskIcon size={16} />}
            label={t(`${h}.subtasks`)}
            value={subtasks.count}
            sub={subtasks.count > 0 ? t(`${h}.across`, { count: subtasks.tasks }) : '—'}
          />
          <HelpTile
            icon={<MentionIcon size={16} />}
            label={t(`${h}.mentions`)}
            value={`${String(mentions.answered)} / ${String(mentions.total)}`}
            sub={mentionsSub}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
          <h3 id="person-worked-with" className="m-0 text-[12px] font-medium text-muted">
            {t(`${k}.workedWith`)}
          </h3>
          {workedWith.length === 0 ? (
            <span className="text-[13px] text-muted">{t(`${h}.noOne`)}</span>
          ) : (
            <ul
              aria-labelledby="person-worked-with"
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {workedWith.map(({ user, count }) => (
                <li key={user.id} className="flex items-center gap-2 text-[13px]">
                  <Avatar user={user} size={24} title={null} />
                  <span className="min-w-0 flex-1 truncate text-2">{user.name}</span>
                  <span className="whitespace-nowrap text-3 tabular-nums">
                    {t(`${h}.times`, { count })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Tile: 32px accent-soft icon square, 12/16 label, 20/26 value, 12/16 muted line. */
function HelpTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 gap-3 rounded-[10px] bg-subtle p-3"
    >
      <span
        aria-hidden="true"
        className="flex size-8 flex-none items-center justify-center rounded-[8px] bg-accent-soft text-accent-ink"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] leading-4 text-3">{label}</span>
        <span className="text-[20px] leading-[26px] font-semibold tabular-nums">{value}</span>
        <span className="text-[12px] leading-4 text-muted">{sub}</span>
      </span>
    </div>
  );
}
