import { shortName } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useTask } from '../../api/tasks';
import { ChevronRightIcon, CloseIcon, ExpandIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { DueDate } from '../../components/ui/DueDate';
import { Drawer } from '../../components/ui/Drawer';
import { IconButton } from '../../components/ui/IconButton';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusDot } from '../../components/ui/StatusDot';
import { TagChip } from '../../components/ui/TagChip';

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="flex h-9 items-center text-muted">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </>
  );
}

/**
 * Task drawer opened by `?task=APP-142` over a List/Board/Calendar (TaskDetail.dc.html shell:
 * sticky 56px header with `project › KEY`, open as full page, close). Phase 10 adds editing,
 * description, subtasks, attachments and activity.
 */
export function TaskDrawer() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const key = params.get('task');
  const task = useTask(key);

  function close() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    });
  }

  if (!key) return null;
  const data = task.data;
  const done = data?.status.category === 'done';

  return (
    <Drawer open onClose={close} label={t('drawer.dialogLabel', { key })}>
      <div className="sticky top-0 z-[3] box-border flex h-14 flex-none items-center gap-2 border-b border-default bg-surface pr-4 pl-6">
        <nav
          aria-label={t('drawer.location')}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-3"
        >
          {data && <span className="truncate">{data.project.name}</span>}
          {data && <ChevronRightIcon size={12} strokeWidth={2} className="flex-none text-faint" />}
          <span className="font-mono text-[12px] text-muted">{key}</span>
        </nav>
        <Link
          to={`/t/${key}`}
          aria-label={t('drawer.openFullPage')}
          title={t('drawer.openFullPage')}
          className="flex size-8 items-center justify-center rounded-[8px] text-3 hover:bg-hover hover:text-3"
        >
          <ExpandIcon size={16} />
        </Link>
        <div aria-hidden="true" className="h-5 w-px bg-[var(--border)]" />
        <IconButton
          label={t('drawer.close')}
          size={32}
          onClick={close}
          icon={<CloseIcon size={16} />}
        />
      </div>

      <div className="flex flex-col gap-6 px-6 pt-6 pb-8">
        {task.isPending && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton width="70%" height={20} />
            <Skeleton width="40%" height={12} />
          </div>
        )}
        {task.isError && (
          <p role="alert" className="m-0 text-[13px] text-muted">
            {t('drawer.loadError')}
          </p>
        )}
        {data && (
          <>
            <h2 className="m-0 text-[22px] leading-[30px] font-semibold tracking-[-0.01em]">
              {data.title}
            </h2>
            <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-y-1 text-[13px]">
              <Property label={t('drawer.status')}>
                <span className="flex items-center gap-2 font-medium">
                  <StatusDot category={data.status.category} />
                  {data.status.name ?? t(`status.${data.status.category}`)}
                </span>
              </Property>
              <Property label={t('drawer.assignees')}>
                {data.assignees.map((user) => (
                  <span key={user.id} className="flex items-center gap-1.5 text-2">
                    <Avatar user={user} size={22} title={null} />
                    {shortName(user.name)}
                  </span>
                ))}
              </Property>
              <Property label={t('table.colDue')}>
                {data.dueDate && <DueDate date={data.dueDate} done={done} />}
              </Property>
              <Property label={t('table.colPriority')}>
                <PriorityFlag priority={data.priority} showLabel />
              </Property>
              <Property label={t('table.colTags')}>
                {data.tags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} />
                ))}
              </Property>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
