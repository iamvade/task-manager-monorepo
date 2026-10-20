import type { ReportTask } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { CountBadge } from '../../../components/ui/CountBadge';
import { PriorityFlag } from '../../../components/ui/PriorityFlag';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { StatusDot } from '../../../components/ui/StatusDot';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { filtersSearch } from '../params';
import { variantKeys, type PersonVariant } from './copy';
import { useWsPath } from '../../../api/workspaces';

/**
 * Current open tasks / Your open tasks (ReportsPeople.dc.html): heading row with a count badge
 * and "See workload" (People) or "Go to My Tasks" (Mine); 44px rows like My Tasks, each opening
 * the task drawer. Sorted by due date by the API.
 */
export function OpenTasksList({
  tasks,
  variant,
}: {
  tasks: readonly ReportTask[];
  variant: PersonVariant;
}) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const k = variantKeys(variant);
  const o = 'reports.person.open';
  // The design's due column is 120 (People) / 140 (Mine); "10-р сарын 10 · хэтэрсэн" needs 168.
  const grid = 'grid grid-cols-[28px_minmax(0,1fr)_176px_136px_168px_96px] items-center';
  const link =
    variant === 'me'
      ? ws('/my-tasks')
      : ws(`/reports/workload${filtersSearch(new URLSearchParams(search))}`);

  const taskHref = (key: string) => {
    const params = new URLSearchParams(search);
    params.set('task', key);
    return { pathname, search: `?${params.toString()}` };
  };

  return (
    <section aria-labelledby="person-open" className="flex min-w-0 flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-default">
        <h2 id="person-open" className="m-0 text-[14px] font-semibold">
          {t(`${k}.openTasks`)}
        </h2>
        <CountBadge value={tasks.length} />
        <span className="flex-1" />
        <Link
          to={link}
          className="rounded-[4px] text-[13px] font-medium whitespace-nowrap text-accent-ink hover:underline"
        >
          {t(`${k}.openLink`)}
        </Link>
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="person-open" className="min-w-[800px]">
          <div role="rowgroup" className="sr-only">
            <div role="row">
              <span role="columnheader" />
              <span role="columnheader">{t(`${o}.cols.task`)}</span>
              <span role="columnheader">{t(`${o}.cols.project`)}</span>
              <span role="columnheader">{t(`${o}.cols.status`)}</span>
              <span role="columnheader">{t(`${o}.cols.due`)}</span>
              <span role="columnheader">{t(`${o}.cols.priority`)}</span>
            </div>
          </div>
          <div role="rowgroup">
            {tasks.length === 0 && (
              <div role="row" className="flex h-11 items-center border-b border-subtle">
                <span role="cell" className="text-[13px] text-muted">
                  {t(`${o}.empty`)}
                </span>
              </div>
            )}
            {tasks.map((task) => (
              <OpenTaskRow key={task.id} task={task} grid={grid} to={taskHref(task.key)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OpenTaskRow({
  task,
  grid,
  to,
}: {
  task: ReportTask;
  grid: string;
  to: { pathname: string; search: string };
}) {
  const { t } = useTranslation();
  const { formatDue, dueTone } = useDates();
  const status = task.status.name ?? t(`status.${task.status.category}`);
  const tone = task.dueDate ? dueTone(task.dueDate) : null;
  const due = task.dueDate
    ? tone === 'overdue'
      ? t('reports.person.open.overdue', { date: formatDue(task.dueDate) })
      : formatDue(task.dueDate)
    : t('reports.person.open.noDue');
  return (
    <Link
      role="row"
      to={to}
      className={`${grid} h-11 border-b border-subtle text-default hover:bg-subtle focus-visible:-outline-offset-2`}
    >
      <span role="cell" className="pl-1.5">
        <StatusDot category={task.status.category} size={10} />
      </span>
      <span role="cell" className="min-w-0 truncate pr-4" title={task.title}>
        <span className="sr-only">{task.key} </span>
        {task.title}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[12px] text-3">
        <ProjectDot color={task.project.color} size={8} />
        <span className="truncate">{task.project.name}</span>
      </span>
      <span role="cell" className="truncate text-[13px] text-2">
        {status}
      </span>
      <span
        role="cell"
        className={cn(
          'truncate pr-2 text-[13px] whitespace-nowrap',
          tone === 'overdue'
            ? 'font-medium text-due-overdue'
            : tone === 'today'
              ? 'font-medium text-due-today'
              : 'text-3',
        )}
      >
        {due}
      </span>
      <span role="cell" className="flex items-center gap-1.5 text-[13px] text-2">
        <PriorityFlag priority={task.priority} showLabel />
      </span>
    </Link>
  );
}
