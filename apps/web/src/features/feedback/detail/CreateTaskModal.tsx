import type { FeedbackDetail, Priority, UserRef } from '@kite/shared';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCreateTaskFromFeedback } from '../../../api/feedback';
import { useProject } from '../../../api/projects';
import { useSidebar, useWorkspaceMembers } from '../../../api/workspaces';
import { CalendarIcon, ChevronDownIcon, CloseIcon, FeedbackIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Kbd } from '../../../components/ui/Kbd';
import { Modal } from '../../../components/ui/Modal';
import { PriorityFlag } from '../../../components/ui/PriorityFlag';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import type { TriggerProps } from '../../../components/ui/Popover';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { toast } from '../../../stores/toast';
import { AssigneePicker } from '../../pickers/AssigneePicker';
import { DuePicker } from '../../pickers/DuePicker';
import { PriorityPicker } from '../../pickers/PriorityPicker';
import { ProjectPicker } from '../../pickers/ProjectPicker';
import { deviceLine, submitterName, typeColors } from '../format';

/**
 * "Create task from feedback" (FeedbackCreateTask.dc.html): title and description prefilled from
 * the report (body + device + "From feedback: name · FB-…", never the email or phone), project,
 * assignee, priority, due, which attachments to copy, and the two checkboxes.
 */
export function CreateTaskModal({
  workspaceId,
  detail,
  onClose,
}: {
  workspaceId: string;
  detail: FeedbackDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { size } = useRelativeTime();
  const { formatWeekday } = useDates();
  const sidebar = useSidebar(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const spaces = sidebar.data?.spaces ?? [];
  const projects = spaces.flatMap((s) => s.projects);
  const create = useCreateTaskFromFeedback(workspaceId);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const device = deviceLine(detail);
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(
    [
      detail.body,
      '',
      ...(device ? [t('feedback.create.deviceLine', { device })] : []),
      t('feedback.create.fromLine', { name: submitterName(detail), ref: detail.ref }),
    ].join('\n'),
  );
  const [projectId, setProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const project = projects.find((p) => p.id === (projectId ?? projects[0]?.id));
  const projectDetail = useProject(project?.id);
  const todo = projectDetail.data?.statuses.find((s) => s.category === 'todo');
  const [assignees, setAssignees] = useState<UserRef[]>([]);
  const [priority, setPriority] = useState<Priority>(detail.type === 'bug' ? 'high' : 'none');
  const [due, setDue] = useState<string | null>(null);
  const [files, setFiles] = useState<ReadonlySet<string>>(
    () => new Set(detail.attachments.map((a) => a.id)),
  );
  const [setLinked, setSetLinked] = useState(true);
  const [notify, setNotify] = useState(false);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!project || !title.trim() || create.isPending) return;
    create.mutate(
      {
        id: detail.id,
        projectId: project.id,
        title: title.trim(),
        description,
        assigneeIds: assignees.map((u) => u.id),
        priority,
        dueDate: due,
        attachmentIds: [...files],
        setLinked,
        notifyOnDone: notify,
      },
      {
        onSuccess: ({ task }) => {
          onClose();
          toast({
            message: t('feedback.create.created', { key: task.key }),
            action: {
              label: t('feedback.create.openTask'),
              onClick: () => {
                const params = new URLSearchParams(window.location.search);
                params.delete('item');
                params.set('task', task.key);
                void navigate({ search: `?${params.toString()}` });
              },
            },
          });
        },
        onError: () => {
          toast({ message: t('feedback.create.failed'), tone: 'danger' });
        },
      },
    );
  };

  const chip = (props: TriggerProps, content: ReactNode, label: string) => (
    <button
      type="button"
      {...props}
      aria-label={label}
      className="box-border flex h-[38px] w-full items-center gap-2 rounded-[8px] border border-default bg-surface px-2.5 text-left text-[14px] hover:bg-hover"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{content}</span>
      <ChevronDownIcon size={12} className="flex-none text-icon" />
    </button>
  );
  const projectLabel = t('feedback.create.project');
  const assigneeLabel = t('feedback.create.assignee');
  const priorityLabel = t('feedback.create.priority');
  const dueLabel = t('feedback.create.due');

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="fb-create-h"
      width={680}
      top={48}
      initialFocus={titleRef}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className="flex flex-col"
      >
        <div className="flex items-center gap-2.5 border-b border-subtle py-3 pr-3.5 pl-5">
          <h2 id="fb-create-h" className="m-0 flex-1 text-[15px] font-semibold">
            {t('feedback.create.title')}
          </h2>
          <span
            style={typeColors(detail.type)}
            className="inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-semibold"
          >
            <FeedbackIcon size={11} strokeWidth={2.25} />
            {t('feedback.create.from', { ref: detail.ref })}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('feedback.create.close')}
            className="flex h-7 items-center gap-1.5 rounded-[6px] pr-1.5 pl-2 text-2 hover:bg-hover"
          >
            <Kbd>Esc</Kbd>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="fb-create-title" className="text-[12px] font-medium text-muted">
              {t('feedback.create.taskTitle')}
            </label>
            <textarea
              id="fb-create-title"
              ref={titleRef}
              rows={1}
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value.replace(/\n/g, ' '));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.preventDefault();
              }}
              className="resize-none rounded-[8px] border border-default bg-surface px-2.5 py-2 text-[17px] leading-6 font-semibold"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="fb-create-desc" className="text-[12px] font-medium text-muted">
              {t('feedback.create.description')}
            </label>
            <textarea
              id="fb-create-desc"
              rows={6}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              className="resize-y rounded-[8px] border border-default bg-surface px-3 py-2.5 text-[14px] leading-[21px] text-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted">{projectLabel}</span>
              <ProjectPicker
                spaces={spaces}
                value={project?.id ?? null}
                label={projectLabel}
                onChange={(p) => {
                  setProjectId(p.id);
                }}
                trigger={(props) =>
                  chip(
                    props,
                    project ? (
                      <>
                        <ProjectDot color={project.color} size={8} />
                        <span className="truncate">
                          {project.name}
                          {todo ? ` / ${todo.name ?? t('status.todo')}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">{t('feedback.create.chooseProject')}</span>
                    ),
                    `${projectLabel}: ${project?.name ?? ''}`,
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted">{assigneeLabel}</span>
              <AssigneePicker
                single
                value={assignees}
                members={members.data ?? []}
                label={assigneeLabel}
                onChange={setAssignees}
                trigger={(props) =>
                  chip(
                    props,
                    assignees[0] ? (
                      <>
                        <Avatar user={assignees[0]} size={22} textSize={9} title={null} />
                        <span className="truncate">{assignees[0].name}</span>
                      </>
                    ) : (
                      <span className="text-muted">{t('feedback.detail.unassigned')}</span>
                    ),
                    `${assigneeLabel}: ${assignees[0]?.name ?? t('feedback.detail.unassigned')}`,
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted">{priorityLabel}</span>
              <PriorityPicker
                value={priority}
                onChange={setPriority}
                label={priorityLabel}
                trigger={(props) =>
                  chip(
                    props,
                    <PriorityFlag priority={priority} showLabel />,
                    `${priorityLabel}: ${t(`priority.${priority}`)}`,
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted">{dueLabel}</span>
              <DuePicker
                value={due}
                onChange={setDue}
                label={dueLabel}
                trigger={(props) =>
                  chip(
                    props,
                    <>
                      <CalendarIcon size={14} className="flex-none text-2" />
                      <span className={cn('truncate', !due && 'text-muted')}>
                        {due ? formatWeekday(due) : t('feedback.create.noDue')}
                      </span>
                    </>,
                    `${dueLabel}: ${due ? formatWeekday(due) : t('feedback.create.noDue')}`,
                  )
                }
              />
            </div>
          </div>

          {detail.attachments.length > 0 && (
            <fieldset className="m-0 flex flex-col gap-2.5 rounded-[10px] border border-subtle bg-subtle p-3">
              <legend className="px-1 text-[12px] font-medium text-2">
                {t('feedback.create.attachments', {
                  count: detail.attachments.length,
                  selected: files.size,
                })}
              </legend>
              <div className="flex flex-wrap gap-2">
                {detail.attachments.map((a) => {
                  const on = files.has(a.id);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        'flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-default bg-surface pr-2.5 pl-2 text-[12px]',
                        !on && 'opacity-60',
                      )}
                    >
                      <Checkbox
                        checked={on}
                        label={a.filename}
                        onChange={(checked) => {
                          setFiles((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(a.id);
                            else next.delete(a.id);
                            return next;
                          });
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className="flex size-6 items-center justify-center rounded-[5px] bg-chip text-[8px] font-bold text-2 uppercase"
                      >
                        {a.filename.split('.').pop()?.slice(0, 4) ?? ''}
                      </span>
                      <span className="flex flex-col leading-[14px]">
                        <span className="font-medium">{a.filename}</span>
                        <span className="text-muted">{size(a.size)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox
                checked={setLinked}
                onChange={setSetLinked}
                label={t('feedback.create.setLinked')}
              />
              <span aria-hidden="true">{t('feedback.create.setLinked')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox checked={notify} onChange={setNotify} label={t('feedback.create.notify')} />
              <span aria-hidden="true">{t('feedback.create.notify')}</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-b-[14px] border-t border-subtle bg-subtle py-3 pr-4 pl-5">
          <span className="flex-1 text-[12px] text-muted">{t('feedback.create.footHint')}</span>
          <Button variant="ghost" onClick={onClose}>
            {t('feedback.create.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            kbd="⌘ ↵"
            disabled={!project || !title.trim() || create.isPending}
          >
            {t('feedback.create.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
