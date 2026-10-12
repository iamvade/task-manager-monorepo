import type { OverviewReport } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheckIcon,
  MyTasksIcon,
  StopwatchIcon,
  WarningIcon,
} from '../../../components/icons';
import { StatCard } from '../../../components/ui/StatCard';
import { useDates } from '../../../lib/useDates';
import { compareDelta, percentOf, type Delta } from '../delta';
import { formatDays, mnFrom } from '../format';
import { DeltaChip } from '../ui/DeltaChip';

/** Completed · Median cycle time · On-time delivery · Overdue (Reports.dc.html stat cards). */
export function OverviewStats({ report }: { report: OverviewReport }) {
  const { t } = useTranslation();
  const { locale } = useDates();
  const { completed, cycleTime, onTime, overdue } = report;

  const completedDelta = compareDelta(completed.current.count, completed.previous.count, {
    kind: 'percent',
  });
  const cycleDelta = compareDelta(cycleTime.current.median, cycleTime.previous.median, {
    kind: 'diff',
    decimals: 1,
    lowerIsBetter: true,
  });
  const onTimePct = percentOf(onTime.current.onTime, onTime.current.total);
  const onTimeDelta = compareDelta(
    onTimePct,
    percentOf(onTime.previous.onTime, onTime.previous.total),
    { kind: 'diff' },
  );

  const footer = (delta: Delta | null, value: (d: Delta) => string, note: string) => (
    <CardFooter>
      {delta && <DeltaChip value={value(delta)} direction={delta.direction} tone={delta.tone} />}
      {note}
    </CardFooter>
  );

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      <StatCard
        className="bg-panel"
        icon={
          <MyTasksIcon size={14} strokeWidth={2.25} className="flex-none text-stat-completed" />
        }
        label={t('reports.cards.completed')}
        value={completed.current.count}
        unit={[
          t('reports.cards.points', { count: completed.current.points }),
          completed.current.unsized > 0 &&
            t('reports.cards.unsized', { count: completed.current.unsized }),
        ]
          .filter(Boolean)
          .join(' ')}
        footer={footer(
          completedDelta,
          (d) => t('reports.delta.percent', { value: d.amount }),
          t('reports.delta.vsPrev'),
        )}
      />
      <StatCard
        className="bg-panel"
        icon={<StopwatchIcon size={14} className="flex-none text-accent-ink" />}
        label={t('reports.cards.cycle')}
        value={formatDays(cycleTime.current.median)}
        unit={
          cycleTime.current.median === null
            ? undefined
            : t('reports.cards.days', { count: cycleTime.current.median })
        }
        footer={footer(
          cycleDelta,
          (d) => t('reports.delta.days', { count: d.amount, value: d.amount.toFixed(1) }),
          t('reports.delta.lowerBetter'),
        )}
      />
      <StatCard
        className="bg-panel"
        icon={<CalendarCheckIcon size={14} className="flex-none text-stat-ontime" />}
        label={t('reports.cards.onTime')}
        value={onTimePct === null ? '—' : `${String(onTimePct)}%`}
        unit={
          onTime.current.total === 0
            ? t('reports.cards.noDueDates')
            : t('reports.cards.onTimeOf', {
                onTime: onTime.current.onTime,
                total: locale === 'mn' ? mnFrom(onTime.current.total) : onTime.current.total,
              })
        }
        footer={footer(
          onTimeDelta,
          (d) => t('reports.delta.points', { count: d.amount }),
          t('reports.delta.vsPrev'),
        )}
      />
      <StatCard
        className={overdue.count > 0 ? undefined : 'bg-panel'}
        tone={overdue.count > 0 ? 'danger' : 'default'}
        icon={<WarningIcon size={14} className="flex-none text-danger" />}
        label={t('reports.cards.overdue')}
        value={overdue.count}
        unit={t('reports.cards.tasks', { count: overdue.count })}
        footer={
          <span
            className={
              overdue.count > 0
                ? 'text-[12px] leading-5 font-medium text-danger'
                : 'text-[12px] leading-5 text-muted'
            }
          >
            {overdue.oldestDaysLate === null || overdue.count === 0
              ? t('reports.cards.noOverdue')
              : t('reports.cards.oldestLate', { count: overdue.oldestDaysLate })}
          </span>
        }
      />
    </div>
  );
}

function CardFooter({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-h-5 flex-wrap items-center gap-1.5 text-[12px] text-muted">
      {children}
    </span>
  );
}
