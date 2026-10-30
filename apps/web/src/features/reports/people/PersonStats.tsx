import type { PersonReport } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { compareDelta, percentOf, type Delta } from '../delta';
import { formatDays } from '../format';
import { DeltaChip } from '../ui/DeltaChip';
import { variantKeys, type PersonVariant } from './copy';

/** One People card (padding 14 16, gap 6): 13px label, 26/32 value + 13px unit, footer line. */
function PersonCard({
  label,
  value,
  unit,
  delta,
  sub,
  danger,
  onClick,
  actionLabel,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Chip text; omitted = no chip. */
  delta?: { text: string; delta: Delta } | null;
  sub: string;
  /** Overdue now with overdue tasks: the only colored card (neutral tone otherwise). */
  danger?: boolean;
  /** Makes the card a button (Completed: shows the tasks), named `actionLabel`. */
  onClick?: () => void;
  actionLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-[12px] border px-4 py-3.5',
        danger ? 'border-danger-card bg-danger-card' : 'border-default bg-panel',
        onClick && 'relative hover:bg-subtle',
      )}
    >
      {onClick && (
        // Covers the card; its text stays readable in the group.
        <button
          type="button"
          aria-label={actionLabel}
          onClick={onClick}
          className="absolute inset-0 cursor-pointer rounded-[12px] border-0 bg-transparent"
        />
      )}
      <span className="text-[13px] text-3">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span
          className={cn(
            'text-[26px] leading-8 font-semibold tabular-nums',
            danger ? 'text-danger' : 'text-default',
          )}
        >
          {value}
        </span>
        {unit && <span className="min-w-0 text-[13px] text-3">{unit}</span>}
      </span>
      <span className="flex min-h-5 flex-wrap items-center gap-1.5 text-[12px] text-muted">
        {delta && <DeltaChip value={delta.text} direction={delta.delta.direction} tone="neutral" />}
        <span className={cn(danger && 'font-medium text-danger')}>{sub}</span>
      </span>
    </div>
  );
}

const neutralDiff = (current: number | null, previous: number | null, decimals = 0) =>
  compareDelta(current, previous, { kind: 'diff', decimals, neutral: true });

/**
 * Completed · On-time · Median cycle time · Overdue now · Review turnaround, each against the
 * previous period with grey arrow-only chips (design-notes 1.14: never good/bad for a person).
 */
export function PersonStats({
  report,
  variant,
  onShowCompleted,
}: {
  report: PersonReport;
  variant: PersonVariant;
  /** The Completed card opens the list of those tasks. */
  onShowCompleted?: () => void;
}) {
  const { t } = useTranslation();
  const k = variantKeys(variant);
  const { completed, onTime, cycleTime, overdue, reviews } = report;
  const prev = (value: string) => t(`${k}.prev`, { value });
  const pts = (count: number) => t('reports.person.cards.pts', { count });
  const fmt1 = (n: number | null) => formatDays(n);

  const completedDelta = neutralDiff(completed.current.count, completed.previous.count);
  const onTimePct = percentOf(onTime.current.onTime, onTime.current.total);
  const onTimePrev = percentOf(onTime.previous.onTime, onTime.previous.total);
  const onTimeDelta = neutralDiff(onTimePct, onTimePrev);
  const cycleDelta = neutralDiff(cycleTime.current.median, cycleTime.previous.median, 1);
  const hasReviews = reviews.current.count > 0;
  const reviewDelta = hasReviews
    ? neutralDiff(reviews.current.medianDays, reviews.previous.medianDays, 1)
    : null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
      <PersonCard
        label={t(`${k}.completed`)}
        value={completed.current.count}
        unit={`${t('reports.cards.tasks', { count: completed.current.count })} · ${pts(completed.current.points)}`}
        delta={completedDelta && { text: String(completedDelta.amount), delta: completedDelta }}
        sub={prev(`${String(completed.previous.count)} · ${pts(completed.previous.points)}`)}
        {...(onShowCompleted && completed.current.count > 0
          ? { onClick: onShowCompleted, actionLabel: t('reports.person.completedList.show') }
          : {})}
      />
      <PersonCard
        label={t('reports.person.cards.onTime')}
        value={onTimePct === null ? '—' : `${String(onTimePct)}%`}
        delta={
          onTimeDelta && {
            text: t('reports.delta.points', { count: onTimeDelta.amount }),
            delta: onTimeDelta,
          }
        }
        sub={
          onTimePct === null
            ? t('reports.person.cards.noDueDates')
            : prev(onTimePrev === null ? '—' : `${String(onTimePrev)}%`)
        }
      />
      <PersonCard
        label={t('reports.person.cards.cycle')}
        value={fmt1(cycleTime.current.median)}
        unit={
          cycleTime.current.median === null
            ? undefined
            : t('reports.cards.days', { count: cycleTime.current.median })
        }
        delta={cycleDelta && { text: cycleDelta.amount.toFixed(1), delta: cycleDelta }}
        sub={prev(
          cycleTime.previous.median === null
            ? '—'
            : `${fmt1(cycleTime.previous.median)} ${t('reports.cards.days', { count: cycleTime.previous.median })}`,
        )}
      />
      <PersonCard
        label={t('reports.person.cards.overdueNow')}
        value={overdue.count}
        unit={t('reports.cards.tasks', { count: overdue.count })}
        danger={overdue.count > 0}
        sub={
          overdue.count > 0 && overdue.oldestDaysLate !== null
            ? t(`${k}.lateSub`, { count: overdue.oldestDaysLate })
            : t(`${k}.noOverdue`)
        }
      />
      <PersonCard
        label={t(`${k}.review`)}
        value={hasReviews ? fmt1(reviews.current.medianDays) : '—'}
        unit={
          hasReviews && reviews.current.medianDays !== null
            ? t('reports.cards.days', { count: reviews.current.medianDays })
            : undefined
        }
        delta={reviewDelta && { text: reviewDelta.amount.toFixed(1), delta: reviewDelta }}
        sub={
          hasReviews
            ? t(`${k}.reviews`, {
                count: reviews.current.count,
                previous: fmt1(reviews.previous.medianDays),
              })
            : t(`${k}.noReviews`)
        }
      />
    </div>
  );
}
