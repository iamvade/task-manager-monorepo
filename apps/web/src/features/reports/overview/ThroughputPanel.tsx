import type { OverviewReport } from '@kite/shared';
import { addDays, format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDates } from '../../../lib/useDates';
import { LineTrend } from '../charts/LineTrend';
import { weekLabel } from '../format';
import { Panel, PanelHeading } from '../ui/Panel';

/**
 * Tasks completed per week, last 12 weeks, against the 12 before (Reports.dc.html). The window
 * doesn't follow the period picker, so the legend names it ("Last 12 weeks") and the weeks that
 * overlap the selected period are tinted. The current week is the hollow point; the previous
 * line is dashed; the figure's summary sentence is its accessible name. A workspace younger than
 * the window has no previous series (the API sends none), so only one line shows.
 */
export function ThroughputPanel({
  throughput,
  range,
}: {
  throughput: OverviewReport['throughput'];
  range: OverviewReport['range'];
}) {
  const { t } = useTranslation();
  const { locale, formatDate } = useDates();
  const { weeks, previous } = throughput;
  const hasPrevious = previous.length > 0;
  const counts = weeks.map((w) => w.count);
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const band = selectedWeeks(weeks, range);
  const weekOf = (weekStart: string) =>
    t('reports.throughput.weekOf', { date: formatDate(weekStart) });

  const summary = t(
    hasPrevious ? 'reports.throughput.summary' : 'reports.throughput.summaryNoPrev',
    {
      first: counts[0] ?? 0,
      last: counts[counts.length - 1] ?? 0,
      peak: Math.max(0, ...counts),
      total: sum(counts),
      previousTotal: sum(previous.map((w) => w.count)),
    },
  );

  return (
    <Panel labelledBy="reports-throughput" className="flex-[999_1_560px] gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeading
          id="reports-throughput"
          title={t('reports.throughput.title')}
          sub={t('reports.throughput.sub')}
        />
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-3">
          <LegendLine color="var(--accent-ink)" label={t('reports.throughput.last12')} />
          {hasPrevious && (
            <LegendLine color="var(--chart-prev)" label={t('reports.throughput.prev12')} dashed />
          )}
          {band && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-accent-soft" />
              {t('reports.throughput.selected')}
            </span>
          )}
        </div>
      </div>
      <LineTrend
        ariaLabel={summary}
        table={{
          caption: t('reports.throughput.title'),
          columns: [
            t('reports.chartTable.week'),
            t('reports.throughput.last12'),
            ...(hasPrevious ? [t('reports.throughput.prev12')] : []),
          ],
          rows: weeks.map((w, i) => [
            weekOf(w.weekStart),
            w.count,
            ...(hasPrevious ? [previous[i]?.count ?? '—'] : []),
          ]),
        }}
        seriesLabel={t('reports.throughput.last12')}
        {...(hasPrevious ? { prevLabel: t('reports.throughput.prev12') } : {})}
        partialNote={t('reports.throughput.partialWeek')}
        band={band}
        prevDashed
        points={weeks.map((w, i) => ({
          label: weekLabel(w.weekStart, locale),
          title: weekOf(w.weekStart),
          value: w.count,
          prev: hasPrevious ? (previous[i]?.count ?? null) : null,
          partial: w.partial,
        }))}
      />
    </Panel>
  );
}

export function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-0.5 w-4 rounded-[1px]"
        style={
          dashed
            ? {
                background: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`,
              }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}

/** First and last week (Mon–Sun) that overlap the selected period; null when none do. */
function selectedWeeks(
  weeks: readonly { weekStart: string }[],
  range: { from: string; to: string },
): { from: number; to: number } | null {
  const inRange = weeks.flatMap((w, i) => {
    const weekEnd = format(addDays(parseISO(w.weekStart), 6), 'yyyy-MM-dd');
    return w.weekStart <= range.to && weekEnd >= range.from ? [i] : [];
  });
  const from = inRange[0];
  const to = inRange[inRange.length - 1];
  return from === undefined || to === undefined ? null : { from, to };
}
