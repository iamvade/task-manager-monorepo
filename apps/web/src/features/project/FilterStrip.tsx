import type { ProjectDetail } from '@kite/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectTasks, useSpaceTasks } from '../../api/tasks';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { FilterChip } from '../../components/ui/FilterChip';
import { useDates } from '../../lib/useDates';
import { useFilterOptions, type FilterOption } from '../views/filterOptions';
import { toTaskQuery } from '../views/taskQuery';
import {
  activeFilterFields,
  NO_SPRINT,
  useViewParams,
  type FilterField,
} from '../views/useViewParams';

type FilterStripProps =
  { project: ProjectDetail; spaceId?: undefined } | { project?: undefined; spaceId: string };

const names = (options: FilterOption[], keys: readonly string[]) =>
  keys
    .map((key) => options.find((o) => o.key === key)?.label)
    .filter(Boolean)
    .join(', ');

/** Active filter chips + "16 tasks · 4 done" for the filtered list (Main.dc.html, 12/24/0). */
export function FilterStrip({ project, spaceId }: FilterStripProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const workspace = useCurrentWorkspace();
  const view = useViewParams();
  const { filters } = view;
  const options = useFilterOptions(project ?? null, project?.workspaceId ?? workspace?.id);

  // Same query (and cache entry) as the list itself.
  const meId = me?.user.id ?? '';
  const scope = project ? 'project' : 'space';
  const query = useMemo(() => toTaskQuery(filters, meId, scope), [filters, meId, scope]);
  const projectTasks = useProjectTasks(project?.id, query);
  const spaceTasks = useSpaceTasks(spaceId, query);
  const tasks = (project ? projectTasks : spaceTasks).data;

  function value(field: FilterField): string {
    switch (field) {
      case 'sprint': {
        const sprint =
          project?.activeSprint?.id === filters.sprint ? project.activeSprint : undefined;
        return sprint
          ? dates.formatRange(sprint.startDate, sprint.endDate)
          : names(options.sprint, filters.sprint ? [filters.sprint] : []);
      }
      case 'due':
        if (filters.dueFrom && filters.dueTo)
          return dates.formatRange(filters.dueFrom, filters.dueTo);
        if (filters.dueFrom)
          return t('filters.fromDate', { date: dates.formatDate(filters.dueFrom) });
        return filters.dueTo
          ? t('filters.untilDate', { date: dates.formatDate(filters.dueTo) })
          : '';
      default:
        return names(options[field], filters[field]);
    }
  }

  function remove(field: FilterField) {
    if (field === 'sprint') view.update({ sprint: NO_SPRINT });
    else if (field === 'due') view.update({ dueFrom: null, dueTo: null });
    else view.update({ [field]: null });
  }

  // Sprints are per project: the space list ignores the param, so no chip there.
  const fields = activeFilterFields(filters).filter((f) => project !== undefined || f !== 'sprint');
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
      {fields.map((field) => {
        const text = value(field);
        return text ? (
          <FilterChip
            key={field}
            label={t(`filters.is.${field}`)}
            value={text}
            removeLabel={t('filters.removeFilter')}
            onRemove={() => {
              remove(field);
            }}
          />
        ) : null;
      })}
      {tasks && (
        <span className="text-[12px] text-muted">
          {t('summary.tasks', {
            count: tasks.length,
            done: tasks.filter((x) => x.status.category === 'done').length,
          })}
        </span>
      )}
    </div>
  );
}
