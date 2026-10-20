import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';
import { useProject } from '../../api/projects';
import { ErrorState } from '../../components/ErrorState';
import { HeaderSkeleton } from '../views/HeaderSkeleton';
import { useCurrentView } from '../views/useCurrentView';
import { useViewParams } from '../views/useViewParams';
import { ArchivedBanner } from './ArchivedBanner';
import { FilterStrip } from './FilterStrip';
import { ProjectBrief } from './ProjectBrief';
import { ProjectHeader } from './ProjectHeader';
import { useOtherWorkspacePath } from '../workspace/useOtherWorkspacePath';

/** /p/:projectId/* — project top bar + filter strip around the routed view. */
export function ProjectLayout() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const view = useCurrentView();
  const { hasFilterParams, update } = useViewParams();
  const activeSprintId = project.data?.activeSprint?.id;
  const elsewhere = useOtherWorkspacePath(project.data?.workspaceId);

  // The active sprint filter applies by default on List/Board (design shows it on); removing it
  // writes `sprint=none` so it stays off. The calendar shows every date (a carried-over filter
  // still applies).
  const calendar = view === 'calendar';
  useEffect(() => {
    if (elsewhere) return;
    if (activeSprintId && !hasFilterParams && !calendar) update({ sprint: activeSprintId }, true);
  }, [activeSprintId, hasFilterParams, calendar, update, elsewhere]);

  if (project.isPending) return <HeaderSkeleton />;
  if (project.isError) return <ErrorState error={project.error} />;
  // A link to a project of another of my workspaces: open it there.
  if (elsewhere) return <Navigate to={elsewhere} replace />;

  return (
    <>
      <ProjectHeader project={project.data} view={view} />
      {project.data.archivedAt && <ArchivedBanner project={project.data} />}
      <ProjectBrief project={project.data} />
      {project.data.taskCount > 0 && <FilterStrip project={project.data} />}
      <Outlet context={project.data} />
    </>
  );
}
