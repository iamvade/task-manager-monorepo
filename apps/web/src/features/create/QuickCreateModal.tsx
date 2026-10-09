import type {
  CreateTask,
  Priority,
  RichTextNode,
  SidebarSpace,
  Status,
  StatusCategory,
  Tag,
  TaskListItem,
  UserRef,
  WorkspaceMember,
} from '@kite/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../api/projects';
import { queryKeys } from '../../api/queryKeys';
import { useTags } from '../../api/tags';
import { useCreateTask } from '../../api/tasks';
import { useCurrentWorkspace, useSidebar, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { RichTextEditor } from '../../components/editor/RichTextEditor';
import type { MentionCandidate } from '../../components/editor/mentions';
import {
  CalendarIcon,
  ChevronRightIcon,
  CloseIcon,
  MoreIcon,
  TagIcon,
} from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { FieldChip } from '../../components/ui/FieldChip';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { StatusDot } from '../../components/ui/StatusDot';
import { Switch } from '../../components/ui/Switch';
import { hasMod, isEditableTarget, modKey } from '../../lib/keyboard';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { useUiStore, type CreateDefaults } from '../../stores/ui';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { DuePicker } from '../pickers/DuePicker';
import { PriorityPicker } from '../pickers/PriorityPicker';
import { ProjectPicker } from '../pickers/ProjectPicker';
import { StatusPicker } from '../pickers/StatusPicker';
import { TagPicker } from '../pickers/TagPicker';
import { useShellLocation } from '../shell/useShellLocation';
import { buildOptimisticTask } from './optimisticTask';
import { useOpenTask } from './useOpenTask';

const HEADING_ID = 'quick-create-heading';

type PickerField = 'assignee' | 'due' | 'project';
const FIELD_KEYS: Record<string, PickerField> = { a: 'assignee', d: 'due', p: 'project' };

/** Quick-create modal (CreateTask.dc.html), mounted once by the shell. */
export function QuickCreateModal() {
  const open = useUiStore((s) => s.createOpen);
  const close = useUiStore((s) => s.closeCreate);
  const defaults = useUiStore((s) => s.createDefaults);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Modal open={open} onClose={close} labelledBy={HEADING_ID} initialFocus={titleRef}>
      <QuickCreateForm defaults={defaults} onClose={close} titleRef={titleRef} />
    </Modal>
  );
}

/** Where a new task goes when nothing says otherwise: this page's project, else the first. */
function fallbackProject(
  spaces: readonly SidebarSpace[],
  shell: { projectId?: string; spaceId?: string },
): string | null {
  const all = spaces.flatMap((s) => s.projects);
  if (shell.projectId && all.some((p) => p.id === shell.projectId)) return shell.projectId;
  const space = spaces.find((s) => s.id === shell.spaceId);
  return space?.projects[0]?.id ?? all[0]?.id ?? null;
}

/** The chosen status if it is this project's, else its category's first, else the first To Do. */
function resolveStatus(
  statuses: readonly Status[],
  choice: { id?: string; category?: StatusCategory },
): Status | null {
  return (
    statuses.find((s) => s.id === choice.id) ??
    statuses.find((s) => s.category === choice.category) ??
    statuses.find((s) => s.category === 'todo') ??
    statuses[0] ??
    null
  );
}

const userRef = ({ id, name, initials, avatarColor }: UserRef): UserRef => ({
  id,
  name,
  initials,
  avatarColor,
});

interface FormProps {
  defaults: CreateDefaults;
  onClose: () => void;
  titleRef: MutableRefObject<HTMLTextAreaElement | null>;
}

function QuickCreateForm({ defaults, onClose, titleRef }: FormProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const openTask = useOpenTask();
  const shell = useShellLocation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const members = useWorkspaceMembers(workspace?.id);
  const tags = useTags(workspace?.id);
  const createMore = useUiStore((s) => s.createMore);
  const setCreateMore = useUiStore((s) => s.setCreateMore);

  const spaces = useMemo(() => sidebar.data?.spaces ?? [], [sidebar.data]);
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(defaults.projectId ?? null);
  const projectId = chosenProjectId ?? fallbackProject(spaces, shell);
  const sidebarProject = spaces.flatMap((s) => s.projects).find((p) => p.id === projectId);
  const project = useProject(projectId ?? undefined);
  const create = useCreateTask(projectId ?? '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<RichTextNode | null>(null);
  const [descriptionEmpty, setDescriptionEmpty] = useState(true);
  /** Bumped to clear the editor after "Create more". */
  const [round, setRound] = useState(0);
  const [assigneeId, setAssigneeId] = useState<string | null>(defaults.assigneeId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(defaults.dueDate ?? null);
  const [priority, setPriority] = useState<Priority>(defaults.priority ?? 'none');
  const [statusChoice, setStatusChoice] = useState<{ id?: string; category?: StatusCategory }>({
    id: defaults.statusId,
    category: defaults.statusCategory,
  });
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [moreFields, setMoreFields] = useState(
    Boolean(defaults.statusId ?? defaults.statusCategory ?? defaults.priority),
  );
  const [openPicker, setOpenPicker] = useState<PickerField | null>(null);
  const [pending, setPending] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  // Ignore the previous project's detail while the newly picked one loads.
  const detail = project.data?.id === projectId ? project.data : undefined;
  const status = detail ? resolveStatus(detail.statuses, statusChoice) : null;
  const team = detail?.members;
  const memberList = useMemo(
    (): readonly WorkspaceMember[] => members.data ?? team ?? [],
    [members.data, team],
  );
  const teamIds = useMemo(() => new Set(team?.map((m) => m.user.id) ?? []), [team]);
  const assignee = memberList.find((m) => m.user.id === assigneeId)?.user ?? null;
  // The sprint the view was filtered to only applies inside that project.
  const sprintId =
    defaults.sprintId && projectId === (defaults.projectId ?? shell.projectId)
      ? defaults.sprintId
      : undefined;

  const meId = me?.user.id;
  const mentions = useMemo((): MentionCandidate[] => {
    const rank = (id: string) => (teamIds.has(id) ? 0 : 1);
    return [...memberList]
      .sort((a, b) => rank(a.user.id) - rank(b.user.id) || a.user.name.localeCompare(b.user.name))
      .map(({ user, title: jobTitle }) => ({
        ...userRef(user),
        hint: user.id === meId ? t('create.you') : jobTitle,
      }));
  }, [memberList, teamIds, meId, t]);

  const canSubmit = Boolean(title.trim() && detail && status && !pending);

  function submit(openAfter: boolean) {
    if (!canSubmit || !detail || !status) return;
    const trimmed = title.trim();
    const assignees = assignee ? [userRef(assignee)] : [];
    const body: CreateTask = {
      title: trimmed,
      statusId: status.id,
      position: 'bottom',
      ...(description && !descriptionEmpty ? { description } : {}),
      ...(assignees.length ? { assigneeIds: assignees.map((a) => a.id) } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(priority !== 'none' ? { priority } : {}),
      ...(selectedTags.length ? { tagIds: selectedTags.map((tag) => tag.id) } : {}),
      ...(sprintId ? { sprintId } : {}),
    };
    // Whatever the client already has for this project, so the temp row lands at the end.
    const known = queryClient
      .getQueriesData<TaskListItem[]>({ queryKey: [...queryKeys.taskLists, 'project', detail.id] })
      .flatMap(([, data]) => data ?? []);
    const optimistic = buildOptimisticTask(
      detail,
      status,
      { title: trimmed, priority, assignees, tags: selectedTags, dueDate, sprintId },
      known,
    );

    setPending(true);
    create.mutate(
      { body, optimistic },
      {
        onSuccess: (task) => {
          setPending(false);
          if (openAfter) {
            onClose();
            openTask(task.key);
            return;
          }
          toast({
            message: t('create.created', { key: task.key }),
            action: {
              label: t('create.openTask'),
              onClick: () => {
                openTask(task.key);
              },
            },
          });
          if (createMore) {
            setTitle('');
            setDescription(null);
            setDescriptionEmpty(true);
            setRound((r) => r + 1);
            titleRef.current?.focus();
          } else {
            onClose();
          }
        },
        onError: () => {
          setPending(false);
          toast({ message: t('create.failed'), tone: 'danger' });
        },
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && hasMod(event)) {
      // The description editor submits ⌘↵ itself (and marks the event handled).
      if (event.defaultPrevented && !event.shiftKey) return;
      event.preventDefault();
      submit(event.shiftKey);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const field = FIELD_KEYS[event.key.toLowerCase()];
    if (!field || isEditableTarget(event.target)) return;
    event.preventDefault();
    // Move focus to that chip first: the picker focuses its search from its own trigger, and
    // focus left on another chip would take the typing (and ↵) instead.
    event.currentTarget.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus();
    setOpenPicker(field);
  }

  const pickerState = (field: PickerField) => ({
    open: openPicker === field,
    onOpenChange: (next: boolean) => {
      setOpenPicker((current) => (next ? field : current === field ? null : current));
    },
  });

  const statusName = (s: Pick<Status, 'name' | 'category'>) => s.name ?? t(`status.${s.category}`);
  const dueLabel = dueDate ? dates.formatDue(dueDate) : t('create.dueDate');
  const dueOverdue = dueDate !== null && dueDate < dates.today;

  return (
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      {/* Header: project chip › New task · Esc × */}
      <div className="flex items-center gap-2 pt-3 pr-3 pl-5">
        <span className="flex h-6 max-w-[240px] items-center gap-1.5 rounded-[6px] bg-surface-2 px-2 text-[12px] font-medium text-2">
          {sidebarProject && <ProjectDot color={sidebarProject.color} size={8} />}
          <span className="truncate">{sidebarProject?.name ?? '…'}</span>
        </span>
        <ChevronRightIcon size={12} strokeWidth={2} className="flex-none text-faint" />
        <h2 id={HEADING_ID} className="m-0 text-[13px] leading-5 font-medium text-3">
          {t('create.heading')}
        </h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('create.close')}
          className="flex h-7 items-center gap-1.5 rounded-[6px] border-0 bg-transparent pr-1.5 pl-2 text-3 hover:bg-hover"
        >
          <Kbd className="px-[5px]">{t('create.escKey')}</Kbd>
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Title + description */}
      <div className="flex flex-col gap-1 px-5 pt-2">
        <label htmlFor="quick-create-title" className="sr-only">
          {t('create.titlePlaceholder')}
        </label>
        <textarea
          id="quick-create-title"
          ref={titleRef}
          rows={1}
          value={title}
          placeholder={t('create.titlePlaceholder')}
          maxLength={500}
          onChange={(e) => {
            setTitle(e.target.value.replace(/\n/g, ' '));
            e.target.style.height = 'auto';
            e.target.style.height = `${String(e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            // Enter moves on to the description; ⌘↵ / ⇧⌘↵ bubble up to create.
            if (e.key === 'Enter' && !hasMod(e)) {
              e.preventDefault();
              editorRef.current?.commands.focus('end');
            }
          }}
          className="resize-none overflow-hidden border-0 bg-transparent py-1 text-[20px] leading-7 font-semibold tracking-[-0.01em] text-default outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <RichTextEditor
          key={round}
          value={description}
          onChange={(doc, editor) => {
            setDescription(doc);
            setDescriptionEmpty(editor.isEmpty);
          }}
          editorRef={editorRef}
          label={t('create.description')}
          placeholder={t('create.descriptionPlaceholder')}
          mentions={mentions}
          variant="plain"
          onSubmit={() => {
            submit(false);
          }}
        />
      </div>

      {/* Field chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-2 pb-4">
        <AssigneePicker
          single
          {...pickerState('assignee')}
          value={assignee ? [assignee] : []}
          members={memberList}
          teamIds={teamIds}
          label={t('create.assignee')}
          onChange={(users) => {
            setAssigneeId(users[0]?.id ?? null);
          }}
          trigger={(props, isOpen) => (
            <FieldChip
              {...props}
              active={isOpen}
              className="pl-1"
              aria-label={`${t('create.assignee')}: ${assignee?.name ?? t('create.unassigned')}`}
              leading={
                assignee ? (
                  <Avatar user={assignee} size={22} title={null} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="box-border flex size-[22px] flex-none items-center justify-center rounded-full border border-dashed border-strong bg-surface-2 text-[10px] text-muted"
                  >
                    –
                  </span>
                )
              }
              label={assignee?.name ?? t('create.unassigned')}
              muted={!assignee}
              kbd="A"
              data-field="assignee"
            />
          )}
        />
        <DuePicker
          {...pickerState('due')}
          value={dueDate}
          onChange={setDueDate}
          label={t('create.dueDate')}
          trigger={(props, isOpen) => (
            <FieldChip
              {...props}
              active={isOpen}
              aria-label={`${t('create.dueDate')}: ${dueDate ? dueLabel : t('create.due.none')}`}
              leading={<CalendarIcon size={14} />}
              label={dueLabel}
              muted={!dueDate}
              className={dueOverdue ? 'text-due-overdue' : undefined}
              kbd="D"
              data-field="due"
            />
          )}
        />
        <ProjectPicker
          {...pickerState('project')}
          spaces={spaces}
          value={projectId}
          label={t('create.project')}
          onChange={(p) => {
            setChosenProjectId(p.id);
            // Keep the status's category; the new project's statuses differ.
            if (status) setStatusChoice({ category: status.category });
          }}
          trigger={(props, isOpen) => (
            <FieldChip
              {...props}
              active={isOpen}
              aria-label={`${t('create.project')}: ${sidebarProject?.name ?? ''}`}
              leading={sidebarProject && <ProjectDot color={sidebarProject.color} size={8} />}
              label={sidebarProject?.name ?? t('create.project')}
              kbd="P"
              data-field="project"
            />
          )}
        />
        {moreFields ? (
          <>
            <PriorityPicker
              value={priority}
              onChange={setPriority}
              label={t('create.priority')}
              trigger={(props, isOpen) => (
                <FieldChip
                  {...props}
                  active={isOpen}
                  aria-label={`${t('create.priority')}: ${t(`priority.${priority}`)}`}
                  leading={<PriorityFlag priority={priority} />}
                  label={t(`priority.${priority}`)}
                  muted={priority === 'none'}
                />
              )}
            />
            {detail && status && (
              <StatusPicker
                value={status.id}
                statuses={detail.statuses}
                onChange={(s) => {
                  setStatusChoice({ id: s.id, category: s.category });
                }}
                label={t('create.status')}
                trigger={(props, isOpen) => (
                  <FieldChip
                    {...props}
                    active={isOpen}
                    aria-label={`${t('create.status')}: ${statusName(status)}`}
                    leading={<StatusDot category={status.category} />}
                    label={statusName(status)}
                  />
                )}
              />
            )}
            <TagPicker
              value={selectedTags}
              tags={tags.data ?? []}
              onChange={setSelectedTags}
              label={t('create.tags')}
              trigger={(props, isOpen) => (
                <FieldChip
                  {...props}
                  active={isOpen}
                  aria-label={`${t('create.tags')}: ${
                    selectedTags.map((tag) => tag.name).join(', ') || t('create.noTags')
                  }`}
                  leading={<TagIcon size={14} />}
                  label={
                    selectedTags.length
                      ? selectedTags.map((tag) => tag.name).join(', ')
                      : t('create.tags')
                  }
                  muted={selectedTags.length === 0}
                />
              )}
            />
          </>
        ) : (
          <button
            type="button"
            aria-label={t('create.moreFields')}
            title={t('create.moreFields')}
            onClick={() => {
              setMoreFields(true);
            }}
            className="box-border flex size-[30px] items-center justify-center rounded-[8px] border border-control bg-control text-3 hover:bg-hover"
          >
            <MoreIcon size={14} />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-3 border-t border-subtle py-3 pr-4 pl-5">
        <Switch checked={createMore} onChange={setCreateMore} label={t('create.createMore')} />
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          {t('create.cancel')}
        </Button>
        <Button
          variant="secondary"
          disabled={!canSubmit}
          onClick={() => {
            submit(true);
          }}
        >
          {t('create.hints.createAndOpen')}
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          aria-busy={pending}
          onClick={() => {
            submit(false);
          }}
          className="gap-2 pr-2 pl-3"
          kbd={`${modKey} ↵`}
        >
          {t('create.submit')}
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-wrap gap-4 rounded-b-[14px] border-t border-subtle bg-subtle px-5 py-2.5 text-[12px] text-muted">
        <Hint keys="A" label={t('create.assignee')} />
        <Hint keys="D" label={t('create.dueDate')} />
        <Hint keys="P" label={t('create.project')} />
        <Hint keys={`${modKey} ↵`} label={t('create.hints.create')} />
        <Hint keys={`⇧ ${modKey} ↵`} label={t('create.hints.createAndOpen')} />
      </div>
    </div>
  );
}

/** Hints-bar item: a raised kbd (2px bottom border) and its label. */
function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="box-border min-w-[10px] rounded-[4px] border border-b-2 border-control bg-control px-[5px] text-center font-sans text-[11px] leading-4 text-2">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
