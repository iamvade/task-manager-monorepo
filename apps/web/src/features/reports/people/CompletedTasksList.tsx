import type { CompletedReportTask } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { CountBadge } from '../../../components/ui/CountBadge';
import { PriorityFlag } from '../../../components/ui/PriorityFlag';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { StatusDot } from '../../../components/ui/StatusDot';
import { useDates } from '../../../lib/useDates';
import { formatDays } from '../format';
import { variantKeys, type PersonVariant } from './copy';

/** Rows shown before "Show all". */
export const COMPLETED_PREVIEW = 5;
/** DOM id of the section (the Completed card scrolls to it). */
export const COMPLETED_SECTION_ID = 'person-completed';

/**
 * "Completed in this period" (not designed; built like the open-tasks list): the tasks behind the
 * Completed card, latest first, with when they were done and their cycle time. Shows 5 until
 * expanded; the CSV export has every one.
 */
export function CompletedTasksList({
  tasks,
  total,
  variant,
  expanded,
  onExpandedChange,
}: {
  tasks: readonly CompletedReportTask[];
  /** All completed in the period (the list stops at 200). */
  total: number;
  variant: PersonVariant;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  const { pathname, search } = useLocation();
  const k = variantKeys(variant);
  const c = 'reports.person.completedList';
  const grid = 'grid grid-cols-[28px_minmax(0,1fr)_176px_136px_96px_96px] items-center';
  const shown = expanded ? tasks : tasks.slice(0, COMPLETED_PREVIEW);

  const taskHref = (key: string) => {
    const params = new URLSearchParams(search);
    params.set('task', key);
    return { pathname, search: `?${params.toString()}` };
  };

  return (
    <section
      id={COMPLETED_SECTION_ID}
      aria-labelledby="person-completed-title"
      className="flex min-w-0 scroll-mt-4 flex-col"
    >
      <div className="flex h-10 items-center gap-2 border-b border-default">
        <h2 id="person-completed-title" className="m-0 text-[14px] font-semibold">
          {t(`${k}.completedTasks`)}
        </h2>
        <CountBadge value={total} />
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="person-completed-title" className="min-w-[800px]">
          <div role="rowgroup" className="sr-only">
            <div role="row">
              <span role="columnheader" />
              <span role="columnheader">{t(`${c}.cols.task`)}</span>
              <span role="columnheader">{t(`${c}.cols.project`)}</span>
              <span role="columnheader">{t(`${c}.cols.completed`)}</span>
              <span role="columnheader">{t(`${c}.cols.cycle`)}</span>
              <span role="columnheader">{t(`${c}.cols.priority`)}</span>
            </div>
          </div>
          <div role="rowgroup">
            {tasks.length === 0 && (
              <div role="row" className="flex h-11 items-center border-b border-subtle">
                <span role="cell" className="text-[13px] text-muted">
                  {t(`${c}.empty`)}
                </span>
              </div>
            )}
            {shown.map((task) => (
              <div
                key={task.id}
                role="row"
                className={`${grid} h-11 border-b border-subtle text-default relative hover:bg-subtle`}
              >
                <span role="cell" className="pl-1.5">
                  <StatusDot category={task.status.category} size={10} />
                </span>
                <span role="cell" className="min-w-0 pr-4">
                  <Link
                    to={taskHref(task.key)}
                    title={task.title}
                    data-task-key={task.key}
                    className="block truncate rounded-[4px] text-default after:absolute after:inset-0 focus-visible:-outline-offset-2"
                  >
                    <span className="sr-only">{task.key} </span>
                    {task.title}
                  </Link>
                </span>
                <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[12px] text-3">
                  <ProjectDot color={task.project.color} size={8} />
                  <span className="truncate">{task.project.name}</span>
                </span>
                <span role="cell" className="truncate text-[13px] text-2">
                  {formatDate(task.completedAt.slice(0, 10))}
                </span>
                <span role="cell" className="truncate text-[13px] text-3 tabular-nums">
                  {task.cycleDays === null
                    ? '—'
                    : t('reports.person.completedList.days', {
                        count: task.cycleDays,
                        value: formatDays(task.cycleDays),
                      })}
                </span>
                <span role="cell" className="flex items-center gap-1.5 text-[13px] text-2">
                  <PriorityFlag priority={task.priority} showLabel />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {tasks.length > COMPLETED_PREVIEW && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            onExpandedChange(!expanded);
          }}
          className="self-start rounded-[6px] border-0 bg-transparent px-1 py-2 text-[13px] font-medium text-accent-ink hover:underline"
        >
          {expanded ? t(`${c}.showLess`) : t(`${c}.showAll`, { count: tasks.length })}
        </button>
      )}
    </section>
  );
}
