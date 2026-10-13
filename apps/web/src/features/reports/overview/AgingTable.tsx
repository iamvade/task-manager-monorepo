import { STALE_DAYS, type AgingTask, type UserRef } from '@kite/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { StatusDot } from '../../../components/ui/StatusDot';
import { useDates } from '../../../lib/useDates';
import { useShortNames } from '../../../lib/useShortNames';
import { mnFrom } from '../format';
import { Panel, PanelHeading } from '../ui/Panel';
import { WarnChip } from '../ui/WarnChip';

/** Rows shown before "View all". */
export const AGING_PREVIEW = 6;

const GRID = 'grid grid-cols-[minmax(0,1fr)_176px_160px_148px_184px] items-center px-5';

interface AgingTableProps {
  tasks: readonly AgingTask[];
  /** Open tasks in the scope. */
  total: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * Open tasks by days in their current status (Reports.dc.html "Aging tasks"): Stale chip after
 * STALE_DAYS; each row opens the task drawer. Shows six until "View all".
 */
export function AgingTable({ tasks, total, expanded, onExpandedChange }: AgingTableProps) {
  const { t } = useTranslation();
  const { locale } = useDates();
  const { pathname, search } = useLocation();
  const rows = expanded ? tasks : tasks.slice(0, AGING_PREVIEW);
  const assignees = useMemo(() => tasks.flatMap((task) => task.assignees), [tasks]);
  const shortNameOf = useShortNames(assignees);
  const days = STALE_DAYS.todo;

  const taskHref = (key: string) => {
    const params = new URLSearchParams(search);
    params.set('task', key);
    return { pathname, search: `?${params.toString()}` };
  };

  return (
    <Panel labelledBy="reports-aging" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <PanelHeading
          id="reports-aging"
          title={t('reports.aging.title')}
          sub={t('reports.aging.sub', { days: locale === 'mn' ? mnFrom(days) : days })}
        />
        {total > AGING_PREVIEW && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              onExpandedChange(!expanded);
            }}
            className="rounded-[6px] border-0 bg-transparent p-0 text-[13px] font-medium text-accent-ink hover:underline"
          >
            {expanded ? t('reports.aging.showLess') : t('reports.aging.viewAll')}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="reports-aging" className="min-w-[860px]">
          <div role="rowgroup">
            <div
              role="row"
              className={`${GRID} h-9 border-y border-table-row bg-subtle text-[12px] font-medium text-muted`}
            >
              <span role="columnheader">{t('reports.aging.cols.task')}</span>
              <span role="columnheader">{t('reports.aging.cols.project')}</span>
              <span role="columnheader">{t('reports.aging.cols.assignee')}</span>
              <span role="columnheader">{t('reports.aging.cols.status')}</span>
              <span role="columnheader" className="text-right">
                {t('reports.aging.cols.days')}
              </span>
            </div>
          </div>
          <div role="rowgroup">
            {rows.length === 0 && (
              <div role="row" className="px-5 py-4 text-[13px] text-muted">
                <span role="cell">{t('reports.aging.empty')}</span>
              </div>
            )}
            {rows.map((task) => (
              <AgingRow
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

function AgingRow({
  task,
  to,
  shortNameOf,
}: {
  task: AgingTask;
  to: { pathname: string; search: string };
  shortNameOf: (user: UserRef) => string;
}) {
  const { t } = useTranslation();
  const [first, ...others] = task.assignees;
  const status = task.status.name ?? t(`status.${task.status.category}`);
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
          <span className="text-[13px] text-muted">{t('reports.aging.unassigned')}</span>
        )}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[13px] text-2">
        <StatusDot category={task.status.category} size={10} />
        <span className="truncate">{status}</span>
      </span>
      <span role="cell" className="flex items-center justify-end gap-2 text-[13px]">
        {task.stale && <WarnChip label={t('reports.aging.stale')} />}
        <span
          className={`min-w-14 text-right tabular-nums ${
            task.stale ? 'font-semibold text-warning-soft' : 'text-2'
          }`}
        >
          {t('reports.aging.days', { count: task.daysInStatus })}
        </span>
      </span>
    </Link>
  );
}
