import { useTranslation } from 'react-i18next';
import { useProject } from '../../../api/projects';
import { reportCsvUrl, useSprintsReport } from '../../../api/reports';
import { useSidebar } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ExportButton, ToolbarDivider } from '../ExportButton';
import { LoadingStatus, UpdatedStatus } from '../HeaderStatus';
import { SPRINT_PARAM, scopeForProject, useReportParams, useSprintParam } from '../params';
import { ReportsHeader } from '../ReportsHeader';
import { ScopeFilters } from '../ScopeFilters';
import { useReportsRole } from '../useReportsRole';
import { BurndownPanel } from './BurndownPanel';
import { CarriedTable } from './CarriedTable';
import { SprintBanner } from './SprintBanner';
import { SprintBarsPanel } from './SprintBarsPanel';
import { SprintCards } from './SprintCards';
import { SprintSelect } from './SprintSelect';
import { SprintsSkeleton } from './SprintsSkeleton';
import { replanHref } from './sprintMath';

/**
 * Reports · Sprints (ReportsSprints.dc.html): one project's sprints. Without a project in the
 * URL the API shows the first project in scope that has sprints; picking a sprint pins both.
 */
export function SprintsTab() {
  const { t } = useTranslation();
  const { workspace } = useReportsRole();
  const sidebar = useSidebar(workspace?.id).data;
  const { filters, setFilters } = useReportParams();
  const sprintId = useSprintParam();
  const { projectId, spaceId } = filters;
  const report = useSprintsReport(workspace?.id, {
    ...(projectId ? { projectId } : {}),
    ...(spaceId ? { spaceId } : {}),
    // The API needs the project with a sprint id; the URL always carries both.
    ...(projectId && sprintId ? { sprintId } : {}),
  });
  const data = report.data;
  const project = data?.project ?? null;
  const sprint = data?.sprint ?? null;
  const statuses = useProject(project?.id).data?.statuses;
  const exportLabel = t('reports.export');

  const scopeFilters = (
    <ScopeFilters
      value={filters}
      requireProject
      shownProjectId={project?.id}
      onChange={(patch) => {
        setFilters(patch, { [SPRINT_PARAM]: null });
      }}
    />
  );

  if (!data) {
    return (
      <>
        <ReportsHeader
          tab="sprints"
          status={report.isError ? undefined : <LoadingStatus />}
          toolbar={
            <>
              {scopeFilters}
              <ToolbarDivider />
              <ExportButton href="" label={exportLabel} disabled />
            </>
          }
        />
        {report.isError ? <ErrorState error={report.error} /> : <SprintsSkeleton />}
      </>
    );
  }

  const csv =
    workspace && project && sprint
      ? reportCsvUrl(workspace.id, 'sprints', { projectId: project.id, sprintId: sprint.id })
      : '';
  const replan =
    project && sprint && sprint.state !== 'past'
      ? replanHref(project.id, sprint.id, statuses)
      : null;

  return (
    <>
      <ReportsHeader
        tab="sprints"
        status={<UpdatedStatus generatedAt={data.generatedAt} />}
        toolbar={
          <>
            {sprint && (
              <SprintSelect
                sprints={data.sprints}
                value={sprint}
                onChange={(id) => {
                  if (!project) return;
                  setFilters(scopeForProject(sidebar?.spaces ?? [], project.id), {
                    [SPRINT_PARAM]: id,
                  });
                }}
              />
            )}
            {scopeFilters}
            <ToolbarDivider />
            <ExportButton href={csv} label={exportLabel} disabled={!csv} />
          </>
        }
      />
      {!project ? (
        <EmptyState
          title={t('reports.sprints.empty.noProjectTitle')}
          body={t('reports.sprints.empty.noProjectBody')}
        />
      ) : !sprint ? (
        <EmptyState
          title={t('reports.sprints.empty.noSprintsTitle', { project: project.name })}
          body={t('reports.sprints.empty.noSprintsBody')}
        />
      ) : (
        <div
          aria-busy={report.isPlaceholderData || undefined}
          className="flex flex-col gap-6 px-6 pt-5 pb-10"
        >
          <SprintBanner sprint={sprint} />
          <SprintCards sprint={sprint} />
          <div className="flex flex-wrap items-stretch gap-4">
            <SprintBarsPanel sprint={sprint} />
            <BurndownPanel sprint={sprint} replanHref={replan} />
          </div>
          <CarriedTable sprint={sprint} replanHref={replan} />
        </div>
      )}
    </>
  );
}
