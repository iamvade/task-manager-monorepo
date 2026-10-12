import type { OverviewReport } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { StatusDot } from '../../../components/ui/StatusDot';
import { BarByCategory } from '../charts/BarByCategory';
import { formatDays } from '../format';
import { insightVariant, waitsInsight, type WaitCategory } from '../insights';
import { InsightBox } from '../ui/InsightBox';
import { Panel, PanelHeading } from '../ui/Panel';

const COLORS: Record<WaitCategory, string> = {
  todo: 'var(--wait-todo)',
  in_progress: 'var(--wait-progress)',
  review: 'var(--wait-review)',
};

/** Median days per status category, with the "waits longest in …" insight (Reports.dc.html). */
export function WaitsPanel({ waits }: { waits: OverviewReport['waits'] }) {
  const { t } = useTranslation();
  const insight = waitsInsight(waits);
  const days = (value: number | null) =>
    value === null ? '—' : t('reports.waits.days', { count: value, value: formatDays(value) });

  return (
    <Panel labelledBy="reports-waits" className="flex-[1_1_360px] gap-4 p-5">
      <PanelHeading
        id="reports-waits"
        title={t('reports.waits.title')}
        sub={t('reports.waits.sub')}
      />
      <BarByCategory
        label={t('reports.waits.title')}
        items={waits.map((w) => ({
          key: w.category,
          label: t(`status.${w.category}`),
          marker: <StatusDot category={w.category} size={10} />,
          value: w.medianDays,
          valueLabel: days(w.medianDays),
          color: COLORS[w.category],
        }))}
      />
      {insight && (
        <InsightBox className="mt-auto">
          {t(`reports.waits.insight.${insightVariant(insight.ratio)}`, {
            status: t(`reports.waits.status.${insight.category}`),
            days: formatDays(insight.days),
            ratio: insight.ratio,
          })}
        </InsightBox>
      )}
    </Panel>
  );
}
