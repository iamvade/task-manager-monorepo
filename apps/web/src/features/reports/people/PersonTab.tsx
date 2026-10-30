import { daysBetween } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportCsvUrl, usePersonReport } from '../../../api/reports';
import { ErrorState } from '../../../components/ErrorState';
import { useDates } from '../../../lib/useDates';
import { ExportButton, ToolbarDivider } from '../ExportButton';
import { LoadingStatus, UpdatedStatus } from '../HeaderStatus';
import { useReportParams } from '../params';
import { PeriodControl } from '../PeriodControl';
import { ReportsEmpty } from '../ReportsEmpty';
import { ReportsHeader } from '../ReportsHeader';
import { useReportsRole } from '../useReportsRole';
import type { PersonVariant } from './copy';
import { HelpingPanel } from './HelpingPanel';
import { MineHeader } from './MineHeader';
import { CompletedTasksList, COMPLETED_SECTION_ID } from './CompletedTasksList';
import { OpenTasksList } from './OpenTasksList';
import { PersonPickerRow } from './PersonPicker';
import { PersonSkeleton } from './PersonSkeleton';
import { PersonStats } from './PersonStats';
import { TrendCards } from './TrendCard';

interface PersonTabProps {
  variant: PersonVariant;
  /** A member's id (People) or `me` (My performance). */
  personId: string;
}

/**
 * Reports · People (ReportsPeople.dc.html, admins pick anyone) and My performance
 * (ReportsMine.dc.html, the caller with "you" copy): period cards with neutral deltas, 12-week
 * trends against the team median, helping others and the person's open tasks.
 */
export function PersonTab({ variant, personId }: PersonTabProps) {
  const { t } = useTranslation();
  const { formatRange } = useDates();
  const { workspace } = useReportsRole();
  const { filters, setFilters } = useReportParams();
  const report = usePersonReport(workspace?.id, personId, filters);
  const data = report.data;
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const tab = variant === 'me' ? 'me' : 'people';
  const csv = workspace
    ? reportCsvUrl(workspace.id, `people/${personId}`, {
        period: filters.period,
        from: filters.from,
        to: filters.to,
      })
    : '';
  const exportLabel = variant === 'me' ? t('reports.person.mine.export') : t('reports.export');

  if (!data) {
    return (
      <>
        <ReportsHeader
          tab={tab}
          status={report.isError ? undefined : <LoadingStatus />}
          toolbar={
            <>
              <PeriodControl value={filters} onChange={setFilters} disabled />
              <ExportButton href={csv} label={exportLabel} disabled />
            </>
          }
        />
        {report.isError ? <ErrorState error={report.error} /> : <PersonSkeleton />}
      </>
    );
  }

  if (data.history.completed < data.history.required) {
    return (
      <>
        <ReportsHeader
          tab={tab}
          toolbar={<ExportButton href={csv} label={exportLabel} disabled />}
        />
        <ReportsEmpty history={data.history} scope={data.scope} onShowAll={() => undefined} />
      </>
    );
  }

  const range = formatRange(data.range.from, data.range.to);
  const days = daysBetween(data.previousRange.from, data.previousRange.to) + 1;
  const compared =
    filters.period === '4w'
      ? t('reports.person.range4w', { range })
      : filters.period === 'lastWeek'
        ? t('reports.person.rangeWeek', { range })
        : filters.period === 'lastMonth'
          ? t('reports.person.rangeMonth', { range })
          : t('reports.person.rangeDays', { range, count: days });

  return (
    <>
      <ReportsHeader
        tab={tab}
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
            <ToolbarDivider />
            <ExportButton href={csv} label={exportLabel} />
          </>
        }
      />
      <div
        aria-busy={report.isPlaceholderData || undefined}
        className="flex flex-col gap-6 px-6 pt-5 pb-10"
      >
        {variant === 'me' ? (
          <MineHeader person={data.person} period={filters.period} range={range} />
        ) : (
          <PersonPickerRow person={data.person} compared={compared} />
        )}
        <PersonStats
          report={data}
          variant={variant}
          onShowCompleted={() => {
            setCompletedExpanded(true);
            requestAnimationFrame(() => {
              document
                .getElementById(COMPLETED_SECTION_ID)
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
          }}
        />
        <TrendCards trends={data.trends} variant={variant} />
        <HelpingPanel
          helping={data.helping}
          variant={variant}
          period={filters.period}
          range={range}
        />
        <OpenTasksList tasks={data.openTasks} variant={variant} />
        <CompletedTasksList
          tasks={data.completedTasks}
          total={data.completed.current.count}
          variant={variant}
          expanded={completedExpanded}
          onExpandedChange={setCompletedExpanded}
        />
      </div>
    </>
  );
}
