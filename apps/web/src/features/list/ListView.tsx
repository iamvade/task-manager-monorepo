import type { ProjectDetail, SidebarSpace } from '@kite/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { useTags } from '../../api/tags';
import { useProjectTasks, useSpaceTasks } from '../../api/tasks';
import { useCurrentWorkspace, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import { toTaskQuery } from '../views/taskQuery';
import { useViewParams } from '../views/useViewParams';
import { EmptyProject } from './EmptyProject';
import { ListSkeleton } from './ListSkeleton';
import { TaskTable } from './TaskTable';

/** The current filters as a list query (memoized: it is part of the query key). */
function useListQuery(scope: 'project' | 'space') {
  const { me } = useAuth();
  const { filters } = useViewParams();
  const meId = me?.user.id ?? '';
  return useMemo(() => toTaskQuery(filters, meId, scope), [filters, meId, scope]);
}

/** `/p/:projectId/list`. */
export function ListView() {
  const project = useOutletContext<ProjectDetail>();
  // Fresh state (selection, add row, empty-state choice) per project.
  return <ProjectList key={project.id} project={project} />;
}

function ProjectList({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const query = useListQuery('project');
  const tasks = useProjectTasks(project.id, query);
  const members = useWorkspaceMembers(project.workspaceId);
  const tags = useTags(project.workspaceId);
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

  const firstTodo = project.statuses.find((s) => s.category === 'todo') ?? project.statuses[0];
  return (
    <TaskTable
      scope="project"
      listKey={`p:${project.id}`}
      label={t('table.label', { project: project.name })}
      tasks={tasks.data}
      project={project}
      members={members.data ?? []}
      tags={tags.data ?? []}
      initialAdding={createFirst && firstTodo ? `status:${firstTodo.id}` : null}
    />
  );
}

/** `/s/:spaceId/list`: every project of the space, grouped by status category. */
export function SpaceListView() {
  const { t } = useTranslation();
  const space = useOutletContext<SidebarSpace>();
  const workspace = useCurrentWorkspace();
  const query = useListQuery('space');
  const tasks = useSpaceTasks(space.id, query);
  const members = useWorkspaceMembers(workspace?.id);
  const tags = useTags(workspace?.id);

  if (tasks.isPending) return <ListSkeleton />;
  if (tasks.isError) return <ErrorState error={tasks.error} />;
  return (
    <TaskTable
      key={space.id}
      scope="space"
      listKey={`s:${space.id}`}
      label={t('table.label', { project: space.name })}
      tasks={tasks.data}
      project={null}
      members={members.data ?? []}
      tags={tags.data ?? []}
    />
  );
}
