import { REPLAN_TIMES, type CarriedTask, type SprintDetail, type UserRef } from '@kite/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { StatusDot } from '../../../components/ui/StatusDot';
import { cn } from '../../../lib/cn';
import { useShortNames } from '../../../lib/useShortNames';
import { Panel, PanelHeading } from '../ui/Panel';
import { WarnChip } from '../ui/WarnChip';

const GRID = 'grid grid-cols-[minmax(0,1fr)_176px_160px_148px_216px] items-center px-5';

interface CarriedTableProps {
  sprint: SprintDetail;
  /** Replan button target (current and future sprints), else null. */
  replanHref: string | null;
}

/**
 * "Carried over from last sprint" (ReportsSprints.dc.html): tasks committed to this sprint that
 * the previous one left unfinished, most-carried first, with 3 pips and "Replan" at 3+; rows
 * open the drawer. The header's Replan button opens the sprint's open tasks in the List view.
 */
export function CarriedTable({ sprint, replanHref }: CarriedTableProps) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const k = 'reports.sprints.carried';
  const prev = sprint.previousSprint;
  const assignees = useMemo(() => sprint.carried.flatMap((task) => task.assignees), [sprint]);
  const shortNameOf = useShortNames(assignees);

  const taskHref = (key: string) => {
    const params = new URLSearchParams(search);
    params.set('task', key);
    return { pathname, search: `?${params.toString()}` };
  };

  return (
    <Panel labelledBy="sprints-carried" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <PanelHeading
          id="sprints-carried"
          title={t(`${k}.title`)}
          sub={
            prev
              ? t(`${k}.sub`, {
                  count: sprint.carried.length,
                  from: prev.number,
                  to: sprint.number,
                  times: REPLAN_TIMES,
                })
              : t(`${k}.subFirst`)
          }
        />
        {replanHref && (
          <Link
            to={replanHref}
            title={t('reports.sprints.replanTitle')}
            className="inline-flex h-7 items-center rounded-[8px] border border-control bg-control px-2.5 text-[12px] font-medium whitespace-nowrap text-default hover:bg-hover"
          >
            {t('reports.sprints.replan')}
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="sprints-carried" className="min-w-[860px]">
          <div role="rowgroup">
            <div
              role="row"
              className={`${GRID} h-9 border-y border-table-row bg-subtle text-[12px] font-medium text-muted`}
            >
              <span role="columnheader">{t(`${k}.cols.task`)}</span>
              <span role="columnheader">{t(`${k}.cols.project`)}</span>
              <span role="columnheader">{t(`${k}.cols.assignee`)}</span>
              <span role="columnheader">{t(`${k}.cols.status`)}</span>
              <span role="columnheader" className="text-right">
                {t(`${k}.cols.times`)}
              </span>
            </div>
          </div>
          <div role="rowgroup">
            {sprint.carried.length === 0 && (
              <div role="row" className="px-5 py-4 text-[13px] text-muted">
                <span role="cell">{t(`${k}.empty`)}</span>
              </div>
            )}
            {sprint.carried.map((task) => (
              <CarriedRow
                key={task.id}
                task={task}
                to={taskHref(task.key)}
                shortNameOf={shortNameOf}
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CarriedRow({
  task,
  to,
  shortNameOf,
}: {
  task: CarriedTask;
  to: { pathname: string; search: string };
  shortNameOf: (user: UserRef) => string;
}) {
  const { t } = useTranslation();
  const k = 'reports.sprints.carried';
  const [first, ...others] = task.assignees;
  const status = task.status.name ?? t(`status.${task.status.category}`);
  const pip = task.replan ? 'var(--sprint-added)' : 'var(--sprint-carried)';
  return (
    <Link
      role="row"
      to={to}
      className={`${GRID} h-12 border-b border-table-row text-default last:border-b-0 hover:bg-subtle focus-visible:-outline-offset-2`}
    >
      <span role="cell" className="min-w-0 truncate pr-4 font-medium" title={task.title}>
        <span className="sr-only">{task.key} </span>
        {task.title}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[13px] text-2">
        <ProjectDot color={task.project.color} size={8} />
        <span className="truncate">{task.project.name}</span>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2">
        {first ? (
          <>
            <Avatar user={first} size={24} title={null} />
            <span className="truncate text-[13px] text-2" title={first.name}>
              {shortNameOf(first)}
              {others.length > 0 && <span className="text-muted"> +{others.length}</span>}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-muted">{t(`${k}.unassigned`)}</span>
        )}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[13px] text-2">
        <StatusDot category={task.status.category} size={10} />
        <span className="truncate">{status}</span>
      </span>
      <span role="cell" className="flex items-center justify-end gap-2.5 text-[13px]">
        {task.replan && <WarnChip label={t(`${k}.replan`)} />}
        <span aria-hidden="true" className="flex gap-[3px]">
          {[0, 1, 2].map((j) => (
            <span
              key={j}
              className="size-2 rounded-[2px]"
              style={{ background: j < task.timesCarried ? pip : 'var(--pip-empty)' }}
            />
          ))}
        </span>
        <span
          className={cn(
            'min-w-[72px] text-right tabular-nums',
            task.replan ? 'font-semibold text-warning-soft' : 'text-2',
          )}
        >
          {t(`${k}.times`, { count: task.timesCarried })}
        </span>
      </span>
    </Link>
  );
}
