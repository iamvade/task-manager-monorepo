import type { PaletteKey, ProjectDetail, TemplateId } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useApplyTemplate } from '../../api/projects';
import {
  BugIcon,
  CycleIcon,
  DownloadIcon,
  PlusIcon,
  RocketIcon,
  UserPlusIcon,
} from '../../components/icons';
import { Kbd } from '../../components/ui/Kbd';
import { Tooltip } from '../../components/ui/Tooltip';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

const TEMPLATES: {
  id: TemplateId;
  i18n: 'productLaunch' | 'sprintPlanning' | 'bugTriage';
  count: number;
  color: PaletteKey;
  icon: ReactNode;
}[] = [
  {
    id: 'product-launch',
    i18n: 'productLaunch',
    count: 18,
    color: 'violet',
    icon: <RocketIcon size={14} />,
  },
  {
    id: 'sprint-planning',
    i18n: 'sprintPlanning',
    count: 12,
    color: 'sky',
    icon: <CycleIcon size={14} />,
  },
  { id: 'bug-triage', i18n: 'bugTriage', count: 6, color: 'rose', icon: <BugIcon size={14} /> },
];

/** Ghost task rows with an accent "new row" and a floating + (aria-hidden). */
function Illustration() {
  const box = 'box-border size-[14px] flex-none rounded-[4px] border-[1.5px] border-solid';
  const bar = 'h-2 rounded-[4px]';
  return (
    <div
      aria-hidden="true"
      className="relative box-border flex w-[320px] max-w-full flex-col gap-2 rounded-[14px] border border-default bg-surface p-3"
    >
      <div className="flex h-8 items-center gap-2.5 rounded-[8px] bg-subtle px-2">
        <span className={cn(box, 'border-strong')} />
        <span className={cn(bar, 'w-[52%] bg-[var(--border)]')} />
        <span className="ml-auto size-5 rounded-full bg-[var(--border-subtle)]" />
      </div>
      <div className="flex h-8 items-center gap-2.5 rounded-[8px] bg-subtle px-2">
        <span className={cn(box, 'border-strong')} />
        <span className={cn(bar, 'w-[38%] bg-[var(--border)]')} />
        <span className="h-3.5 w-9 rounded-[4px] bg-accent-soft" />
        <span className="ml-auto size-5 rounded-full bg-[var(--border-subtle)]" />
      </div>
      <div className="box-border flex h-8 items-center gap-2.5 rounded-[8px] border border-dashed border-accent bg-accent-soft px-2">
        <span className={cn(box, 'border-accent')} />
        <span className={cn(bar, 'w-[44%] bg-accent opacity-35')} />
      </div>
      <span className="absolute -right-3.5 -bottom-3.5 flex size-9 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_0_4px_var(--bg)]">
        <PlusIcon size={16} strokeWidth={2.5} />
      </span>
    </div>
  );
}

interface EmptyProjectProps {
  project: ProjectDetail;
  /** "Create first task" (`C` is global): the quick-create modal for this project. */
  onCreateFirst: () => void;
}

/** A project without tasks (EmptyProject.dc.html): illustration, CTAs and three templates. */
export function EmptyProject({ project, onCreateFirst }: EmptyProjectProps) {
  const { t } = useTranslation();
  const apply = useApplyTemplate(project);

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-[72px] pb-12">
      <div className="flex w-full max-w-[560px] flex-col items-center gap-6 text-center">
        <Illustration />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {t('emptyProject.title', { project: project.name })}
          </h1>
          <p className="m-0 text-[14px] leading-[22px] text-3">{t('emptyProject.body')}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCreateFirst}
            className="flex h-10 items-center gap-2 rounded-[8px] border-0 bg-accent px-4 text-[14px] font-medium text-white hover:brightness-110"
          >
            <PlusIcon size={14} strokeWidth={2.5} />
            {t('emptyProject.createFirst')}
            <Kbd variant="onAccent" className="px-[5px]">
              C
            </Kbd>
          </button>
          <Tooltip content={t('emptyProject.comingSoon')}>
            {(props) => (
              <button
                {...props}
                type="button"
                aria-disabled="true"
                className="flex h-10 cursor-not-allowed items-center gap-2 rounded-[8px] border border-default bg-control px-3.5 text-[14px] font-medium text-2 opacity-60"
              >
                <DownloadIcon size={14} />
                {t('emptyProject.importCsv')}
              </button>
            )}
          </Tooltip>
          <Link
            to="/settings?tab=members"
            className="flex h-10 items-center gap-2 rounded-[8px] px-3.5 text-[14px] font-medium text-2 no-underline hover:bg-hover hover:text-2"
          >
            <UserPlusIcon size={14} />
            {t('shell.invite')}
          </Link>
        </div>

        <div className="mt-6 flex w-full flex-col gap-3 border-t border-subtle pt-6">
          <span className="text-[12px] font-medium text-muted">{t('emptyProject.orTemplate')}</span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 text-left">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={apply.isPending}
                aria-busy={apply.isPending && apply.variables === tpl.id}
                onClick={() => {
                  apply.mutate(tpl.id);
                }}
                className="flex flex-col gap-1.5 rounded-[10px] border border-default bg-surface p-3 text-left enabled:hover:border-strong enabled:hover:bg-subtle disabled:cursor-progress disabled:opacity-70"
              >
                <span
                  className={cn(
                    'pal-fill flex size-7 items-center justify-center rounded-[8px]',
                    paletteClass('space', tpl.color),
                  )}
                >
                  {tpl.icon}
                </span>
                <span className="text-[13px] font-semibold text-default">
                  {t(`emptyProject.templates.${tpl.i18n}.name`)}
                </span>
                <span className="text-[12px] leading-4 text-muted">
                  {t(`emptyProject.templates.${tpl.i18n}.desc`, { count: tpl.count })}
                </span>
              </button>
            ))}
          </div>
          {apply.isError && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {t('common.genericError')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
