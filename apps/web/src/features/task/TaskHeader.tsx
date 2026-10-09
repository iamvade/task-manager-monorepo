import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCompleteTask, useDeleteTask, useDuplicateTask, useRestoreTask } from '../../api/tasks';
import {
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  LinkIcon,
  MoreIcon,
  MoveIcon,
  TrashIcon,
} from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { toast } from '../../stores/toast';
import { useTaskView } from './TaskContext';

interface TaskHeaderProps {
  /** Opens the Project property's picker (move to another project). */
  onMoveToProject: () => void;
}

/**
 * Sticky 56px drawer header (TaskDetail.dc.html): `project › KEY` breadcrumb, Mark complete,
 * copy link, open as full page, … (duplicate, move, delete), divider, close.
 */
export function TaskHeader({ onMoveToProject }: TaskHeaderProps) {
  const { t } = useTranslation();
  const { task, project, layout, close } = useTaskView();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const complete = useCompleteTask();
  const remove = useDeleteTask();
  const restore = useRestoreTask();
  const duplicate = useDuplicateTask();
  const done = task.status.category === 'done';
  const projectHref = `/p/${task.project.id}/list`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${task.key}`);
      toast({ message: t('header.linkCopied') });
    } catch {
      toast({ message: t('drawer.copyFailed'), tone: 'danger' });
    }
  }

  function openTask(key: string) {
    if (layout === 'page') {
      void navigate(`/t/${key}`);
    } else {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', key);
        return next;
      });
    }
  }

  function onDuplicate() {
    duplicate.mutate(
      { task, title: t('drawer.copyTitle', { title: task.title }) },
      {
        onSuccess: (copy) => {
          toast({
            message: t('drawer.duplicated', { key: copy.key }),
            action: {
              label: t('table.open'),
              onClick: () => {
                openTask(copy.key);
              },
            },
          });
        },
        onError: () => {
          toast({ message: t('common.genericError'), tone: 'danger' });
        },
      },
    );
  }

  function onDelete() {
    const { key } = task;
    const failed = () => {
      toast({ message: t('common.genericError'), tone: 'danger' });
    };
    // Promises, not per-call callbacks: the drawer unmounts before the server answers.
    remove
      .mutateAsync(task)
      .then(() => {
        toast({
          message: t('drawer.deleted', { key }),
          action: {
            label: t('drawer.undo'),
            onClick: () => {
              restore.mutateAsync(task).catch(failed);
            },
          },
        });
      })
      .catch(failed);
    if (layout === 'page') void navigate(projectHref);
    else close();
  }

  return (
    <div className="sticky top-0 z-[3] box-border flex h-14 flex-none items-center gap-2 border-b border-default bg-surface pr-4 pl-6">
      <nav
        aria-label={t('drawer.location')}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-3"
      >
        <Link to={projectHref} className="truncate text-3 hover:text-default">
          {task.project.name}
        </Link>
        <ChevronRightIcon size={12} strokeWidth={2} className="flex-none text-faint" />
        <span className="font-mono text-[12px] text-muted">{task.key}</span>
      </nav>
      <Button
        icon={<CheckIcon size={14} />}
        onClick={() => {
          // Completing goes to the first Done status; reopening is decided by the server.
          const target = done ? undefined : project?.statuses.find((s) => s.category === 'done');
          complete.mutate({
            task,
            done: !done,
            optimistic: {
              status: target
                ? {
                    id: target.id,
                    name: target.name,
                    category: target.category,
                    color: target.color,
                  }
                : task.status,
              position: task.position,
            },
          });
        }}
        className="text-2"
      >
        {done ? t('drawer.markIncomplete') : t('drawer.markComplete')}
      </Button>
      <IconButton
        label={t('drawer.copyLink')}
        title={t('drawer.copyLink')}
        size={32}
        icon={<LinkIcon size={16} />}
        onClick={() => {
          void copyLink();
        }}
      />
      {layout === 'drawer' && (
        <Link
          to={`/t/${task.key}`}
          aria-label={t('drawer.openFullPage')}
          title={t('drawer.openFullPage')}
          className="flex size-8 items-center justify-center rounded-[8px] text-3 hover:bg-hover hover:text-3"
        >
          <ExpandIcon size={16} />
        </Link>
      )}
      <Menu
        label={t('drawer.moreActions')}
        placement="bottom-end"
        items={[
          {
            id: 'duplicate',
            label: t('drawer.duplicate'),
            icon: <CopyIcon size={14} />,
            onSelect: onDuplicate,
          },
          {
            id: 'move',
            label: t('create.moveToProject'),
            icon: <MoveIcon size={14} />,
            onSelect: onMoveToProject,
          },
          { type: 'separator', id: 'sep' },
          {
            id: 'delete',
            label: t('table.delete'),
            icon: <TrashIcon size={14} />,
            danger: true,
            onSelect: onDelete,
          },
        ]}
        trigger={(props, open) => (
          <IconButton
            {...props}
            label={t('drawer.moreActions')}
            title={t('drawer.moreActions')}
            size={32}
            icon={<MoreIcon size={16} />}
            className={open ? 'bg-hover' : undefined}
          />
        )}
      />
      {layout === 'drawer' && (
        <>
          <div aria-hidden="true" className="h-5 w-px bg-[var(--border)]" />
          <IconButton
            label={t('drawer.close')}
            title={t('drawer.close')}
            size={32}
            onClick={close}
            icon={<CloseIcon size={16} />}
          />
        </>
      )}
    </div>
  );
}
