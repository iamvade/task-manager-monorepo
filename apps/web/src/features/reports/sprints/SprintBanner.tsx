import type { SprintDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { sprintLabel } from '../../../lib/sprint';
import { useDates } from '../../../lib/useDates';

/**
 * Sprint heading (ReportsSprints.dc.html banner): "Sprint 14 · Oct 6 – Oct 24" 18/24, the
 * working-day line under it, and a 240×6 bar filled by the elapsed working days.
 */
export function SprintBanner({ sprint }: { sprint: SprintDetail }) {
  const { t } = useTranslation();
  const { formatRange, formatDate } = useDates();
  const { total, elapsed, left } = sprint.workingDays;
  const line =
    sprint.state === 'current'
      ? t('reports.sprints.dayOf', { day: elapsed, total, count: left })
      : sprint.state === 'past'
        ? t('reports.sprints.completedSprint', { total })
        : t('reports.sprints.futureSprint', { date: formatDate(sprint.startDate), total });
  const share = total ? Math.min(1, elapsed / total) : 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="m-0 text-[18px] leading-6 font-semibold">
          {t('reports.sprints.heading', {
            name: sprintLabel(t, sprint),
            range: formatRange(sprint.startDate, sprint.endDate),
          })}
        </h2>
        <span className="text-[13px] text-muted">{line}</span>
      </div>
      <span className="flex-1" />
      <div
        role="progressbar"
        aria-label={t('reports.sprints.elapsedLabel')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={elapsed}
        className="flex h-1.5 w-60 max-w-full overflow-hidden rounded-[3px] bg-progress-track"
      >
        <span
          className="h-1.5 rounded-[3px] bg-accent"
          style={{ width: `${(share * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
