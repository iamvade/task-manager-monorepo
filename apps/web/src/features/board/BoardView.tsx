import type { ProjectDetail, SidebarSpace } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { useProjectTasks, useSpaceTasks } from '../../api/tasks';
import { useCurrentWorkspace, useWorkspaceMembers } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import { EmptyProject } from '../list/EmptyProject';
import { ListSkeleton } from '../list/ListSkeleton';
import { useTaskQuery } from '../views/useTaskQuery';
import { Board } from './Board';

/** `/p/:projectId/board`. */
export function BoardView() {
  const project = useOutletContext<ProjectDetail>();
  return <ProjectBoard key={project.id} project={project} />;
}

function ProjectBoard({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const query = useTaskQuery('project');
  const tasks = useProjectTasks(project.id, query);
  const members = useWorkspaceMembers(project.workspaceId);
  const [createFirst, setCreateFirst] = useState(false);

  if (project.taskCount === 0 && !createFirst) {
    return (
      <EmptyProject
        project={project}
        onCreateFirst={() => {
          setCreateFirst(true);
        }}
      />
    );
  }
  if (tasks.isPending) return <ListSkeleton />;
  if (tasks.isError) return <ErrorState error={tasks.error} />;
  return (
    <Board
      scope="project"
      boardKey={`board:p:${project.id}`}
      label={t('board.label', { project: project.name })}
      tasks={tasks.data}
      project={project}
      members={members.data ?? []}
    />
  );
}

/** `/s/:spaceId/board`: columns are the 4 status categories; cards show their project. */
export function SpaceBoardView() {
  const { t } = useTranslation();
  const space = useOutletContext<SidebarSpace>();
  const workspace = useCurrentWorkspace();
  const query = useTaskQuery('space');
  const tasks = useSpaceTasks(space.id, query);
  const members = useWorkspaceMembers(workspace?.id);

  if (tasks.isPending) return <ListSkeleton />;
  if (tasks.isError) return <ErrorState error={tasks.error} />;
  return (
    <Board
      key={space.id}
      scope="space"
      boardKey={`board:s:${space.id}`}
      label={t('board.label', { project: space.name })}
      tasks={tasks.data}
      project={null}
      members={members.data ?? []}
    />
  );
}
