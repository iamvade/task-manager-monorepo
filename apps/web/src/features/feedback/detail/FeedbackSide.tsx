import {
  FEEDBACK_STATUSES,
  isClosedCategory,
  type FeedbackDetail,
  type FeedbackStatus,
} from '@kite/shared';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import {
  useFeedbackTaskSuggestions,
  useLinkFeedback,
  useSetFeedbackAssignees,
  useSetFeedbackStatus,
  useUnlinkFeedback,
} from '../../../api/feedback';
import { useWorkspaceMembers } from '../../../api/workspaces';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LinkIcon,
  PlusIcon,
} from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Picker } from '../../../components/ui/Picker';
import { Popover } from '../../../components/ui/Popover';
import { StatusDot } from '../../../components/ui/StatusDot';
import { cn } from '../../../lib/cn';
import { DUE_TONE_CLASS } from '../../../lib/dates';
import { useDates } from '../../../lib/useDates';
import { toast } from '../../../stores/toast';
import { AssigneePicker } from '../../pickers/AssigneePicker';
import { useDateTime } from '../format';
import { FeedbackStatusDot } from '../parts';
import { TaskSearchList } from '../TaskPicker';
import { DuplicatesList } from './Duplicates';

const CreateTaskModal = lazy(() =>
  import('./CreateTaskModal').then((m) => ({ default: m.CreateTaskModal })),
);

const fieldLabel = 'text-[12px] font-medium text-muted';
const fieldButton =
  'box-border flex h-[38px] w-full items-center gap-2 rounded-[8px] border border-default bg-surface px-3 text-left text-[14px] font-medium';

/** Side column: status, linked task, assignee (the task's), details, the linked reports. */
export function FeedbackSide({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: FeedbackDetail;
}) {
  const { t } = useTranslation();
  const dateTime = useDateTime();
  const setStatus = useSetFeedbackStatus(workspaceId);
  const failed = () => {
    toast({ message: t('feedback.detail.failed'), tone: 'danger' });
  };

  return (
    <div className="box-border flex max-w-[360px] min-w-0 flex-[1_1_300px] flex-col gap-[22px] border-l border-subtle bg-subtle px-5 pt-6 pb-8">
      <div className="flex flex-col gap-1.5">
        <span id="fb-status-l" className={fieldLabel}>
          {t('feedback.detail.status')}
        </span>
        <Popover
          label={t('feedback.detail.status')}
          width={280}
          trigger={(props, open) => (
            <button
              type="button"
              {...props}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-labelledby="fb-status-l fb-status-v"
              className={cn(fieldButton, 'hover:bg-hover')}
            >
              <FeedbackStatusDot status={detail.status} />
              <span id="fb-status-v" className="flex-1">
                {t(`feedback.status.${detail.status}`)}
              </span>
              <ChevronDownIcon size={12} className="text-icon" />
            </button>
          )}
        >
          {(close) => (
            <Picker<FeedbackStatus>
              items={FEEDBACK_STATUSES}
              value={detail.status}
              getKey={(s) => s}
              getLabel={(s) => t(`feedback.status.${s}`)}
              label={t('feedback.detail.status')}
              onClose={close}
              onSelect={(status) => {
                close();
                if (status !== detail.status) {
                  setStatus.mutate({ id: detail.id, status }, { onError: failed });
                }
              }}
              renderItem={(s) => (
                <span className="flex flex-1 items-center gap-2">
                  <FeedbackStatusDot status={s} />
                  {t(`feedback.status.${s}`)}
                </span>
              )}
            />
          )}
        </Popover>
      </div>

      <LinkedTask workspaceId={workspaceId} detail={detail} />
      <Assignee workspaceId={workspaceId} detail={detail} />

      <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 border-t border-subtle pt-4 text-[13px]">
        <dt className="text-muted">{t('feedback.detail.type')}</dt>
        <dd className="m-0">{t(`feedback.type.${detail.type}`)}</dd>
        <dt className="text-muted">{t('feedback.detail.source')}</dt>
        <dd className="m-0">{t('feedback.detail.publicPage')}</dd>
        <dt className="text-muted">{t('feedback.detail.received')}</dt>
        <dd className="m-0">{dateTime(detail.createdAt)}</dd>
        {(detail.device.screen ?? detail.device.timezone) && (
          <>
            <dt className="text-muted">{t('feedback.detail.device')}</dt>
            <dd className="m-0 break-words">
              {[detail.device.screen, detail.device.language, detail.device.timezone]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </>
        )}
      </dl>

      {detail.linkedReports.length > 1 && (
        <DuplicatesList workspaceId={workspaceId} detail={detail} />
      )}
    </div>
  );
}

function LinkedTask({ workspaceId, detail }: { workspaceId: string; detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { formatDue, dueTone } = useDates();
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const link = useLinkFeedback(workspaceId);
  const unlink = useUnlinkFeedback(workspaceId);
  const suggestions = useFeedbackTaskSuggestions(detail.id, picking);
  const task = detail.task;
  const closed = task !== null && isClosedCategory(task.status.category);
  const failed = () => {
    toast({ message: t('feedback.detail.failed'), tone: 'danger' });
  };

  return (
    <section aria-labelledby="fb-task-h" className="flex flex-col gap-2.5">
      <h2 id="fb-task-h" className={cn(fieldLabel, 'm-0')}>
        {t('feedback.detail.linkedTask')}
      </h2>
      {task ? (
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-default bg-surface p-3">
          <div className="flex items-start gap-2">
            <CheckCircleIcon size={16} className="mt-0.5 flex-none text-icon" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14px] leading-5 font-semibold break-words">{task.title}</span>
              <span className="font-mono text-[11px] text-muted">
                {task.key} · {task.project.name}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
            <span className="text-muted">{t('feedback.detail.taskStatus')}</span>
            <span className="flex items-center gap-1.5">
              <StatusDot category={task.status.category} size={10} />
              {task.status.name ?? t(`status.${task.status.category}`)}
            </span>
            <span className="text-muted">{t('feedback.detail.due')}</span>
            {task.dueDate ? (
              <span className={DUE_TONE_CLASS[dueTone(task.dueDate, closed)]}>
                {dueTone(task.dueDate, closed) === 'overdue'
                  ? t('feedback.detail.overdue', { date: formatDue(task.dueDate) })
                  : formatDue(task.dueDate)}
              </span>
            ) : (
              <span className="text-muted">{t('feedback.detail.noDue')}</span>
            )}
            {detail.linkedReports.length > 1 && (
              <>
                <span className="text-muted">{t('feedback.detail.reports')}</span>
                <span>
                  {t('feedback.detail.reportsCount', { count: detail.linkedReports.length })}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-task-key={task.key}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('item');
                next.set('task', task.key);
                void navigate({ search: `?${next.toString()}` });
              }}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-default text-[13px] font-medium hover:bg-hover"
            >
              <ExternalLinkIcon size={13} />
              {t('feedback.detail.openTask')}
            </button>
            <button
              type="button"
              disabled={unlink.isPending}
              onClick={() => {
                unlink.mutate(
                  { id: detail.id },
                  {
                    onSuccess: () => {
                      toast({ message: t('feedback.detail.unlinked', { key: task.key }) });
                    },
                    onError: failed,
                  },
                );
              }}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-default bg-surface text-[13px] font-medium text-danger-soft hover:bg-hover"
            >
              <LinkIcon size={13} />
              {t('feedback.detail.unlink')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 mb-1 text-[13px] text-2">{t('feedback.detail.notLinked')}</p>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
            className="flex h-[38px] items-center gap-2 rounded-[8px] bg-accent px-3 text-[13px] font-medium text-white hover:brightness-110"
          >
            <PlusIcon size={14} strokeWidth={2.5} />
            {t('feedback.detail.createTask')}
          </button>
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => {
              setPicking((p) => !p);
            }}
            className={cn(
              'flex h-[38px] items-center gap-2 rounded-[8px] border px-3 text-left text-[13px] font-medium',
              picking
                ? 'border-[var(--accent)] bg-accent-soft text-accent-ink'
                : 'border-default bg-surface text-default hover:bg-hover',
            )}
          >
            <LinkIcon size={14} />
            {t('feedback.detail.linkExisting')}
          </button>
          {picking && (
            <div
              role="dialog"
              aria-label={t('feedback.detail.linkExisting')}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setPicking(false);
                }
              }}
              className="overflow-hidden rounded-[12px] border border-default bg-surface shadow-popover"
            >
              <TaskSearchList
                suggested={suggestions.data?.tasks ?? []}
                excludeId={detail.task?.id}
                onClose={() => {
                  setPicking(false);
                }}
                onPick={(picked) => {
                  setPicking(false);
                  link.mutate(
                    { id: detail.id, taskId: picked.id },
                    {
                      onSuccess: () => {
                        toast({ message: t('feedback.detail.linked', { key: picked.key }) });
                      },
                      onError: failed,
                    },
                  );
                }}
              />
            </div>
          )}
        </div>
      )}
      {creating && (
        <Suspense fallback={null}>
          <CreateTaskModal
            workspaceId={workspaceId}
            detail={detail}
            onClose={() => {
              setCreating(false);
            }}
          />
        </Suspense>
      )}
    </section>
  );
}

function Assignee({ workspaceId, detail }: { workspaceId: string; detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const members = useWorkspaceMembers(workspaceId);
  const setAssignees = useSetFeedbackAssignees(workspaceId);
  const task = detail.task;
  const assignee = task?.assignees[0];

  const button = (props: object, open = false) => (
    <button
      type="button"
      {...props}
      disabled={!task}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-labelledby="fb-assignee-l fb-assignee-v"
      aria-describedby="fb-assignee-hint"
      className={cn(
        fieldButton,
        'pl-2',
        task ? 'hover:bg-hover' : 'cursor-not-allowed bg-subtle text-muted',
      )}
    >
      {assignee ? (
        <Avatar user={assignee} size={24} textSize={9} title={null} />
      ) : (
        <span
          aria-hidden="true"
          className="box-border flex size-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-strong text-[9px] text-muted"
        >
          –
        </span>
      )}
      <span id="fb-assignee-v" className="flex-1 truncate text-[14px] font-normal">
        {task && task.assignees.length > 0
          ? task.assignees.map((u) => u.name).join(', ')
          : t('feedback.detail.unassigned')}
      </span>
      <ChevronDownIcon size={12} className="text-icon" />
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span id="fb-assignee-l" className={fieldLabel}>
        {t('feedback.detail.assignee')}
      </span>
      {task ? (
        <AssigneePicker
          single
          value={task.assignees}
          members={members.data ?? []}
          label={t('feedback.detail.assignee')}
          onChange={(users) => {
            setAssignees.mutate(
              { id: detail.id, userIds: users.map((u) => u.id) },
              {
                onError: () => {
                  toast({ message: t('feedback.detail.failed'), tone: 'danger' });
                },
              },
            );
          }}
          trigger={(props, open) => button(props, open)}
        />
      ) : (
        button({})
      )}
      <span id="fb-assignee-hint" className="text-[12px] leading-4 text-muted">
        {task
          ? t('feedback.detail.assigneeHint', { key: task.key })
          : t('feedback.detail.assigneeDisabled')}
      </span>
    </div>
  );
}
