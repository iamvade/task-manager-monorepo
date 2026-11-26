import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '../../api/workspaces';
import { FilterChip } from '../../components/ui/FilterChip';
import { useDates } from '../../lib/useDates';
import { useFilterOptions, type FilterOption } from '../views/filterOptions';
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

/** Active filter chips for the current view; nothing when no filter is on. */
export function FilterStrip({ project }: FilterStripProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const workspace = useCurrentWorkspace();
  const view = useViewParams();
  const { filters } = view;
  const options = useFilterOptions(project ?? null, project?.workspaceId ?? workspace?.id);

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

  const fields = activeFilterFields(filters);
  if (fields.length === 0) return null;
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
    </div>
  );
}
