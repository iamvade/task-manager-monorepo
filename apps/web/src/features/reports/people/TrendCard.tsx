import type { PersonReport } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useDates } from '../../../lib/useDates';
import { ReferenceTrend, type ReferencePoint } from '../charts/ReferenceTrend';
import { formatDays, weekLabel } from '../format';
import { Panel, PanelHeading } from '../ui/Panel';
import { variantKeys, type PersonVariant } from './copy';

type Trends = PersonReport['trends'];

/** Completed per week · Cycle time, each over 12 weeks against the team median. */
export function TrendCards({ trends, variant }: { trends: Trends; variant: PersonVariant }) {
  const { t } = useTranslation();
  const k = variantKeys(variant);
  const completed = trends.weeks.map((w) => w.completed);
  const cycle = trends.weeks.map((w) => w.cycleMedian);
  const days = (v: number) => `${v.toFixed(1)} ${t('reports.cards.days', { count: v })}`;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4">
      <TrendCard
        id="person-trend-completed"
        title={t(`${k}.trendCompleted`)}
        seriesLabel={t(`${k}.seriesCompleted`)}
        weeks={trends.weeks}
        values={completed}
        reference={trends.teamCompletedMedian}
        max={Math.max(6, Math.max(0, ...completed) + 1)}
        formatValue={String}
        formatTooltip={(v) => `${String(v)} ${t('reports.cards.tasks', { count: v })}`}
        summary={(values) => t('reports.person.trends.summaryCompleted', { values })}
        teamSentence={(v) => t('reports.person.trends.teamCompleted', { value: v.toFixed(1) })}
      />
      <TrendCard
        id="person-trend-cycle"
        title={t('reports.person.trends.cycle')}
        seriesLabel={t(`${k}.seriesCycle`)}
        weeks={trends.weeks}
        values={cycle}
        reference={trends.teamCycleMedian}
        max={Math.max(
          6,
          Math.ceil(Math.max(0, trends.teamCycleMedian ?? 0, ...cycle.map((v) => v ?? 0))),
        )}
        formatValue={(v) => v.toFixed(1)}
        formatTooltip={days}
        summary={(values) => t('reports.person.trends.summaryCycle', { values })}
        teamSentence={(v) => t('reports.person.trends.teamCycle', { value: formatDays(v) })}
      />
    </div>
  );
}

interface TrendCardProps {
  id: string;
  title: string;
  seriesLabel: string;
  weeks: Trends['weeks'];
  values: readonly (number | null)[];
  reference: number | null;
  max: number;
  formatValue: (v: number) => string;
  formatTooltip: (v: number) => string;
  summary: (values: string) => string;
  teamSentence: (value: number) => string;
}

/**
 * Trend panel (ReportsPeople.dc.html): 14/600 title + "Last 12 weeks", a stacked legend on the
 * right (series, dashed Team median), the 96px line with the team median as reference.
 */
function TrendCard({
  id,
  title,
  seriesLabel,
  weeks,
  values,
  reference,
  max,
  formatValue,
  formatTooltip,
  summary,
  teamSentence,
}: TrendCardProps) {
  const { t } = useTranslation();
  const { locale } = useDates();
  const points: ReferencePoint[] = weeks.map((w, i) => ({
    label: weekLabel(w.weekStart, locale),
    title: t('reports.throughput.weekOf', { date: weekLabel(w.weekStart, locale) }),
    value: values[i] ?? null,
    partial: w.partial,
  }));
  const shown = (v: number | null) =>
    v === null ? t('reports.person.trends.noValue') : formatValue(v);
  const ariaLabel = [
    summary(points.map((p) => `${p.label} ${shown(p.value)}`).join(', ')),
    reference === null ? '' : teamSentence(reference),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Panel labelledBy={id} className="gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <PanelHeading id={id} title={title} sub={t('reports.person.trends.sub')} size={14} />
        <div className="flex flex-col items-end gap-0.5 text-[12px] text-3">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className="h-0.5 w-3.5 bg-[var(--accent-ink)]" />
            {seriesLabel}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden="true"
              className="h-0 w-3.5 border-t-2 border-dashed"
              style={{ borderColor: 'var(--text-faint)' }}
            />
            {t('reports.person.trends.teamMedian')}
          </span>
        </div>
      </div>
      <ReferenceTrend
        points={points}
        reference={reference}
        max={max}
        formatValue={formatValue}
        formatTooltip={formatTooltip}
        partialNote={t('reports.throughput.partialWeek')}
        ariaLabel={ariaLabel}
        table={{
          caption: title,
          columns: [t('reports.chartTable.week'), seriesLabel],
          rows: points.map((p) => [p.title, p.value === null ? '—' : formatTooltip(p.value)]),
        }}
      />
    </Panel>
  );
}
