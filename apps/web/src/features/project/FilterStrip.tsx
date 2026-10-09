import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useSprints } from '../../api/projects';
import { FilterChip } from '../../components/ui/FilterChip';
import { useDates } from '../../lib/useDates';
import { NO_SPRINT, useViewParams } from '../views/useViewParams';

/** Active filter chips + "16 tasks · 4 done" (Main.dc.html, padding 12/24/0). */
export function FilterStrip({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const dates = useDates();
  const view = useViewParams();
  const sprints = useSprints(view.sprintId ? project.id : undefined);
  const sprint =
    project.activeSprint?.id === view.sprintId
      ? project.activeSprint
      : sprints.data?.find((s) => s.id === view.sprintId);

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
      {sprint && (
        <FilterChip
          label={t('filters.sprintIs')}
          value={dates.formatRange(sprint.startDate, sprint.endDate)}
          removeLabel={t('filters.removeFilter')}
          onRemove={() => {
            view.update({ sprint: NO_SPRINT });
          }}
        />
      )}
      <span className="text-[12px] text-muted">
        {t('summary.tasks', { count: project.taskCount, done: project.doneCount })}
      </span>
    </div>
  );
}
