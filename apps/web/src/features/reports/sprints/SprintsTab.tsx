import { useTranslation } from 'react-i18next';
import { useProject } from '../../../api/projects';
import { useSprints } from '../../../api/sprints';
import { reportCsvUrl, useSprintsReport } from '../../../api/reports';
import { useSidebar, useWsPath } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ExportButton, ToolbarDivider } from '../ExportButton';
import { LoadingStatus, UpdatedStatus } from '../HeaderStatus';
import { SPRINT_PARAM, useReportParams, useSprintParam } from '../params';
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
import { replanHref, replanSpaceHref, replanTarget } from './sprintMath';

/**
 * Reports · Sprints (ReportsSprints.dc.html): the sprints covering a project in scope (sprints
 * are shared by projects). "Project: All" counts every project of the sprint in scope; picking a
 * project narrows the numbers to its tasks. The sprint stays picked while it covers the scope.
 */
export function SprintsTab() {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { workspace } = useReportsRole();
  const sidebar = useSidebar(workspace?.id).data;
  const { filters, setFilters } = useReportParams();
  const sprintId = useSprintParam();
  const { projectId, spaceId } = filters;
  const allSprints = useSprints(workspace?.id).data;
  const scope = {
    ...(projectId ? { projectId } : {}),
    ...(spaceId ? { spaceId } : {}),
  };
  const report = useSprintsReport(workspace?.id, { ...scope, ...(sprintId ? { sprintId } : {}) });
  const data = report.data;
  const project = data?.project ?? null;
  const sprint = data?.sprint ?? null;
  const replanTo = sprint ? replanTarget(sprint, project?.id) : null;
  const replanProjectId = replanTo && 'projectId' in replanTo ? replanTo.projectId : undefined;
  const statuses = useProject(replanProjectId).data?.statuses;
  const exportLabel = t('reports.export');

  /** Keeps the picked sprint when it covers a project of the new scope. */
  function sprintFor(next: { spaceId?: string | undefined; projectId?: string | undefined }) {
    const covers = allSprints?.find((s) => s.id === sprintId)?.projectIds;
    if (!sprintId || !covers) return null;
    const spaces = sidebar?.spaces ?? [];
    const inScope = next.projectId
      ? [next.projectId]
      : spaces
          .filter((s) => !next.spaceId || s.id === next.spaceId)
          .flatMap((s) => s.projects.map((p) => p.id));
    return covers.some((id) => inScope.includes(id)) ? sprintId : null;
  }

  const scopeFilters = (
    <ScopeFilters
      value={filters}
      onChange={(patch) => {
        setFilters(patch, { [SPRINT_PARAM]: sprintFor({ ...filters, ...patch }) });
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
    workspace && sprint
      ? reportCsvUrl(workspace.id, 'sprints', { ...scope, sprintId: sprint.id })
      : '';
  const replan =
    sprint && replanTo && sprint.state !== 'past'
      ? 'projectId' in replanTo
        ? ws(replanHref(replanTo.projectId, sprint.id, statuses))
        : ws(replanSpaceHref(replanTo.spaceId, sprint.id))
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
                  setFilters({}, { [SPRINT_PARAM]: id });
                }}
              />
            )}
            {scopeFilters}
            <ToolbarDivider />
            <ExportButton href={csv} label={exportLabel} disabled={!csv} />
          </>
        }
      />
      {!sprint ? (
        <EmptyState
          title={
            project
              ? t('reports.sprints.empty.noSprintsTitle', { project: project.name })
              : t('reports.sprints.empty.noSprintsAnyTitle')
          }
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
