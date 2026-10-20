import type { OverviewReport } from '@kite/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import { PlusIcon, StopwatchIcon, TrendIcon, WaitIcon, WarningIcon } from '../../components/icons';
import { buttonVariants } from '../../components/ui/buttonStyles';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import { SegmentProgress } from './ui/SegmentProgress';

interface ReportsEmptyProps {
  history: OverviewReport['history'];
  scope: OverviewReport['scope'];
  /** "See reports for all projects": clears the space and project filters. */
  onShowAll: () => void;
}

const cta = 'flex h-10 items-center gap-2 rounded-[8px] text-[14px] font-medium';

/**
 * Not enough history yet (ReportsEmpty.dc.html): a chart waiting for data, "x / 5" progress
 * toward the first report, actions, and a preview of the reports to come.
 */
export function ReportsEmpty({ history, scope, onShowAll }: ReportsEmptyProps) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const spaces = useSidebar(workspace?.id).data?.spaces ?? [];
  const openCreate = useUiStore((s) => s.openCreate);
  const progressId = useId();

  const project = spaces.flatMap((s) => s.projects).find((p) => p.id === scope.projectId);
  const space = spaces.find((s) => s.id === scope.spaceId);
  const name = project?.name ?? space?.name ?? workspace?.name ?? '';
  const scoped = scope.projectId !== null || scope.spaceId !== null;
  const left = Math.max(0, history.required - history.completed);

  const previews = [
    {
      title: t('reports.empty.throughputTitle'),
      desc: t('reports.empty.throughputDesc'),
      Icon: TrendIcon,
    },
    { title: t('reports.empty.waitsTitle'), desc: t('reports.empty.waitsDesc'), Icon: WaitIcon },
    { title: t('reports.empty.agingTitle'), desc: t('reports.empty.agingDesc'), Icon: WarningIcon },
  ];

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-14 pb-12">
      <div className="flex w-full max-w-[640px] flex-col items-center gap-6 text-center">
        <EmptyChart />

        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {t('reports.empty.title')}
          </h2>
          <p className="m-0 text-[14px] leading-[22px] text-3">
            {t(project ? 'reports.empty.bodyProject' : 'reports.empty.bodyScope', {
              name,
              required: history.required,
            })}
          </p>
        </div>

        <div className="box-border flex w-full max-w-[400px] flex-col gap-2 rounded-[12px] border border-default px-4 py-3.5 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <span id={progressId} className="text-[13px] font-medium">
              {t('reports.empty.progressLabel')}
            </span>
            <span className="text-[13px] text-3 tabular-nums">
              <strong className="font-semibold text-default">{history.completed}</strong> /{' '}
              {history.required}
            </span>
          </div>
          <SegmentProgress
            value={history.completed}
            max={history.required}
            labelledBy={progressId}
          />
          <span className="text-[12px] text-muted">
            {t('reports.empty.progressHint', { count: history.completed, left })}
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              openCreate(project ? { projectId: project.id } : {});
            }}
            className={cn(cta, buttonVariants.primary, 'border-0 px-4')}
          >
            <PlusIcon size={14} strokeWidth={2.5} />
            {t('reports.empty.ctaCreate')}
          </button>
          {project && (
            <Link
              to={ws(`/p/${project.id}/list`)}
              className={cn(cta, buttonVariants.secondary, 'px-3.5')}
            >
              {t('reports.empty.ctaProject')}
            </Link>
          )}
          {scoped && (
            <button
              type="button"
              onClick={onShowAll}
              className={cn(cta, buttonVariants.ghost, 'border-0 px-3.5')}
            >
              {t('reports.empty.ctaAll')}
            </button>
          )}
        </div>

        <div className="mt-4 flex w-full flex-col gap-3 border-t border-subtle pt-6">
          <span className="text-[12px] font-medium text-muted">{t('reports.empty.preview')}</span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2 text-left">
            {previews.map(({ title, desc, Icon }) => (
              <div
                key={title}
                className="flex flex-col gap-1.5 rounded-[10px] border border-subtle bg-subtle p-3"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-[8px] bg-accent-soft text-accent-ink"
                >
                  <Icon size={14} />
                </span>
                <span className="text-[13px] font-semibold">{title}</span>
                <span className="text-[12px] leading-4 text-muted">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const GHOST_BARS = [34, 52, 44, 70];

/** 320×148 card: axes, dashed guides, one real accent bar, four dashed ghosts, a clock badge. */
function EmptyChart() {
  return (
    <div
      aria-hidden="true"
      className="relative box-border h-[148px] w-[320px] max-w-full rounded-[14px] border border-default bg-panel pt-4 pr-4 pb-3 pl-7"
    >
      <div className="absolute right-4 bottom-7 left-7 h-px bg-[var(--border)]" />
      <div className="absolute top-11 right-4 left-7 h-0 border-t border-dashed border-subtle" />
      <div className="absolute top-[76px] right-4 left-7 h-0 border-t border-dashed border-subtle" />
      <div className="absolute top-4 bottom-7 left-7 w-px bg-[var(--border)]" />
      <div className="absolute bottom-[29px] left-11 flex items-end gap-3.5">
        <span className="h-[22px] w-[18px] rounded-t-[4px] bg-accent" />
        {GHOST_BARS.map((h) => (
          <span
            key={h}
            className="box-border w-[18px] rounded-t-[4px] border-[1.5px] border-b-0 border-dashed"
            style={{ height: h, borderColor: 'var(--empty-bar-dash)' }}
          />
        ))}
      </div>
      <div className="absolute right-4 bottom-2 left-7 flex justify-between">
        <span className="h-1.5 w-10 rounded-[3px] bg-chip" />
        <span className="h-1.5 w-10 rounded-[3px] bg-chip" />
      </div>
      <span className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full border border-default bg-panel shadow-[0_0_0_4px_var(--bg)]">
        <StopwatchIcon size={16} className="text-accent-ink" />
      </span>
    </div>
  );
}
