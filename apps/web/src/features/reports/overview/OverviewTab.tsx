import { daysBetween } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { reportCsvUrl, useOverviewReport } from '../../../api/reports';
import { ErrorState } from '../../../components/ErrorState';
import { useDates } from '../../../lib/useDates';
import { ExportButton, ToolbarDivider } from '../ExportButton';
import { LoadingStatus, UpdatedStatus } from '../HeaderStatus';
import { useReportParams } from '../params';
import { PeriodControl } from '../PeriodControl';
import { ReportsEmpty } from '../ReportsEmpty';
import { ReportsHeader } from '../ReportsHeader';
import { ScopeFilters } from '../ScopeFilters';
import { useReportsRole } from '../useReportsRole';
import { AgingTable } from './AgingTable';
import { OverviewSkeleton } from './OverviewSkeleton';
import { OverviewStats } from './OverviewStats';
import { ThroughputPanel } from './ThroughputPanel';
import { WaitsPanel } from './WaitsPanel';

/** Reports · Overview (Reports.dc.html), with its loading and not-enough-history states. */
export function OverviewTab() {
  const { t } = useTranslation();
  const { formatRange } = useDates();
  const { workspace } = useReportsRole();
  const { filters, setFilters, agingAll, setAgingAll } = useReportParams();
  const report = useOverviewReport(workspace?.id, {
    ...filters,
    ...(agingAll ? { agingLimit: 'all' as const } : {}),
  });
  const data = report.data;
  const csv = workspace ? reportCsvUrl(workspace.id, 'overview', filters) : '';
  const exportLabel = t('reports.export');

  if (!data) {
    return (
      <>
        <ReportsHeader
          tab="overview"
          status={report.isError ? undefined : <LoadingStatus />}
          toolbar={
            <>
              <PeriodControl value={filters} onChange={setFilters} disabled />
              <ExportButton href={csv} label={exportLabel} disabled />
            </>
          }
        />
        {report.isError ? <ErrorState error={report.error} /> : <OverviewSkeleton />}
      </>
    );
  }

  if (data.history.completed < data.history.required) {
    return (
      <>
        <ReportsHeader
          tab="overview"
          toolbar={
            <>
              <ScopeFilters value={filters} onChange={setFilters} projectOnly />
              <ExportButton href={csv} label={exportLabel} disabled />
            </>
          }
        />
        <ReportsEmpty
          history={data.history}
          scope={data.scope}
          onShowAll={() => {
            setFilters({ spaceId: undefined, projectId: undefined });
          }}
        />
      </>
    );
  }

  const range = formatRange(data.range.from, data.range.to);
  const previous = formatRange(data.previousRange.from, data.previousRange.to);
  const days = daysBetween(data.previousRange.from, data.previousRange.to) + 1;

  return (
    <>
      <ReportsHeader
        tab="overview"
        status={
          <UpdatedStatus
            generatedAt={data.generatedAt}
            isFetching={report.isFetching}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
        toolbar={
          <>
            <PeriodControl value={filters} onChange={setFilters} />
            <ScopeFilters value={filters} onChange={setFilters} />
            <ToolbarDivider />
            <ExportButton href={csv} label={exportLabel} />
          </>
        }
      />
      <div
        aria-busy={report.isPlaceholderData || undefined}
        className="flex flex-col gap-6 px-6 pt-5 pb-10"
      >
        <p className="m-0 text-[13px] text-muted">
          {filters.period === '4w'
            ? t('reports.range.compare4w', { range, previous })
            : filters.period === 'lastWeek'
              ? t('reports.range.compareWeek', { range, previous })
              : filters.period === 'lastMonth'
                ? t('reports.range.compareMonth', { range, previous })
                : t('reports.range.compareDays', { range, previous, count: days })}
        </p>
        <OverviewStats report={data} />
        <div className="flex flex-wrap items-stretch gap-4">
          <ThroughputPanel throughput={data.throughput} range={data.range} />
          <WaitsPanel waits={data.waits} />
        </div>
        <AgingTable
          tasks={data.aging.tasks}
          total={data.aging.total}
          expanded={agingAll}
          onExpandedChange={setAgingAll}
        />
      </div>
    </>
  );
}
