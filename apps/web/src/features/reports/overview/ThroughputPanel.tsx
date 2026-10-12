import type { OverviewReport } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useDates } from '../../../lib/useDates';
import { LineTrend } from '../charts/LineTrend';
import { weekLabel } from '../format';
import { Panel, PanelHeading } from '../ui/Panel';

/**
 * Tasks completed per week, last 12 weeks, against the 12 before (Reports.dc.html). The current
 * week is the hollow point; the figure's summary sentence is its accessible name.
 */
export function ThroughputPanel({ throughput }: { throughput: OverviewReport['throughput'] }) {
  const { t } = useTranslation();
  const { locale } = useDates();
  const { weeks, previous } = throughput;
  const counts = weeks.map((w) => w.count);
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

  const summary = t('reports.throughput.summary', {
    first: counts[0] ?? 0,
    last: counts[counts.length - 1] ?? 0,
    peak: Math.max(0, ...counts),
    total: sum(counts),
    previousTotal: sum(previous.map((w) => w.count)),
  });

  return (
    <Panel labelledBy="reports-throughput" className="flex-[999_1_560px] gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeading
          id="reports-throughput"
          title={t('reports.throughput.title')}
          sub={t('reports.throughput.sub')}
        />
        <div className="flex items-center gap-4 text-[12px] text-3">
          <LegendLine color="var(--accent-ink)" label={t('reports.throughput.thisPeriod')} />
          <LegendLine color="var(--chart-prev)" label={t('reports.throughput.prevPeriod')} />
        </div>
      </div>
      <LineTrend
        ariaLabel={summary}
        seriesLabel={t('reports.throughput.thisPeriod')}
        prevLabel={t('reports.throughput.prevPeriod')}
        partialNote={t('reports.throughput.partialWeek')}
        points={weeks.map((w, i) => ({
          label: weekLabel(w.weekStart, locale),
          title: t('reports.throughput.weekOf', { date: weekLabel(w.weekStart, locale) }),
          value: w.count,
          prev: previous[i]?.count ?? null,
          partial: w.partial,
        }))}
      />
    </Panel>
  );
}

export function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="h-0.5 w-4 rounded-[1px]" style={{ background: color }} />
      {label}
    </span>
  );
}
