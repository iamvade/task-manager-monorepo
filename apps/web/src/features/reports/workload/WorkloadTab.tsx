import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { reportCsvUrl, useReassignWorkloadTask, useWorkloadReport } from '../../../api/reports';
import { useWorkspaceMembers } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import { InfoIcon } from '../../../components/icons';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { useUiStore } from '../../../stores/ui';
import { ExportButton, ToolbarDivider } from '../ExportButton';
import { LoadingStatus, UpdatedStatus } from '../HeaderStatus';
import { useReportParams, useWorkloadSort, type WorkloadSort } from '../params';
import { ReportsHeader } from '../ReportsHeader';
import { ScopeFilters } from '../ScopeFilters';
import { useReportsRole } from '../useReportsRole';
import { sharedCapacity, sortPeople, workloadScale } from './layout';
import { WorkloadSkeleton } from './WorkloadSkeleton';
import { WorkloadTable } from './WorkloadTable';

/**
 * Reports · Workload (ReportsWorkload.dc.html): open work per person by due bucket against
 * their capacity, sortable by open size or overdue; rows expand to rebalance tasks in place.
 */
export function WorkloadTab() {
  const { t, i18n } = useTranslation();
  const { workspace } = useReportsRole();
  const { filters, setFilters } = useReportParams();
  const { sort, setSort } = useWorkloadSort();
  const openCreate = useUiStore((s) => s.openCreate);
  const scope = {
    ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
  };
  const report = useWorkloadReport(workspace?.id, scope);
  const members = useWorkspaceMembers(workspace?.id).data ?? [];
  const reassign = useReassignWorkloadTask(workspace?.id ?? '', members);
  const data = report.data;
  const people = useMemo(() => (data ? sortPeople(data.people, sort) : []), [data, sort]);
  const csv = workspace ? reportCsvUrl(workspace.id, 'workload', scope) : '';
  const exportLabel = t('reports.export');
  const k = 'reports.workload';

  const toolbar = (disabled: boolean) => (
    <>
      <ScopeFilters value={filters} onChange={setFilters} />
      <ToolbarDivider />
      <ExportButton href={csv} label={exportLabel} disabled={disabled} />
    </>
  );

  if (!data) {
    return (
      <>
        <ReportsHeader
          tab="workload"
          status={report.isError ? undefined : <LoadingStatus />}
          toolbar={toolbar(true)}
        />
        {report.isError ? <ErrorState error={report.error} /> : <WorkloadSkeleton />}
      </>
    );
  }

  const capacity = sharedCapacity(data.people);
  const average = data.people.length ? data.totals.points / data.people.length : 0;
  const teamLine = [
    [
      t(`${k}.people`, { count: data.people.length }),
      t(`${k}.openTasks`, { count: data.totals.openTasks }),
      t(`${k}.pointsTotal`, { count: data.totals.points }),
      t(`${k}.average`, {
        avg: average.toLocaleString(i18n.language, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      }),
    ].join(' · '),
    capacity === null ? t(`${k}.capacityLineMixed`) : t(`${k}.capacityLine`, { count: capacity }),
  ].join(' ');

  return (
    <>
      <ReportsHeader
        tab="workload"
        status={
          <UpdatedStatus
            generatedAt={data.generatedAt}
            isFetching={report.isFetching}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
        toolbar={toolbar(false)}
      />
      {data.people.length === 0 ? (
        <EmptyState title={t(`${k}.emptyTitle`)} body={t(`${k}.emptyBody`)} />
      ) : (
        <div
          aria-busy={report.isPlaceholderData || undefined}
          className="flex flex-col gap-5 px-6 pt-5 pb-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex max-w-[640px] flex-col gap-1">
              <h2 className="m-0 text-[18px] leading-6 font-semibold">{t(`${k}.title`)}</h2>
              <p className="m-0 text-[13px] leading-5 text-3">{teamLine}</p>
            </div>
            <div className="flex items-center gap-2">
              <span id="workload-sort" className="text-[13px] text-muted">
                {t(`${k}.sortBy`)}
              </span>
              <SegmentedControl<WorkloadSort>
                labelledBy="workload-sort"
                size="toolbar"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'size', label: t(`${k}.sort.size`) },
                  { value: 'overdue', label: t(`${k}.sort.overdue`) },
                ]}
              />
            </div>
          </div>
          <WorkloadTable
            people={people}
            scale={workloadScale(data.people)}
            members={members}
            onReassign={(task, users) => {
              reassign.mutate({ taskId: task.id, users });
            }}
            onAssignWork={(person) => {
              openCreate({
                assigneeId: person.user.id,
                ...(filters.projectId ? { projectId: filters.projectId } : {}),
              });
            }}
          />
          <p className="m-0 flex items-start gap-2 text-[12px] leading-[18px] text-muted">
            <InfoIcon size={14} className="mt-0.5 flex-none" />
            <span>
              {capacity === null
                ? t(`${k}.footnoteMixed`)
                : t(`${k}.footnote`, { count: capacity })}
            </span>
          </p>
        </div>
      )}
    </>
  );
}
