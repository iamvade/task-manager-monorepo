import type { StandupTaskRef, UserRef } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAddSummaryTask } from '../../../api/standups';
import { useWsPath } from '../../../api/workspaces';
import { CheckIcon, PlusIcon } from '../../../components/icons';
import { appUrl } from '../../../lib/basePath';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { useUiStore } from '../../../stores/ui';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';
import { useDayView } from './DayContext';
import { dayHref } from './links';
import { backLinkDoc, createdFrom, taskTitleOf, type ItemSource } from './summary';

const sourceKey = (s: ItemSource) =>
  s.kind === 'blocker' ? `blocker-${s.blockerId}` : `today-${s.entryId}-${s.itemIndex}`;

/**
 * "Create task" on a Today item or a blocker, for whoever writes the day's meeting summary
 * (`canSummarize`): quick create opens with the item's text as the title, its author as the
 * assignee (while still in the group) and a link back to the day; the new task is listed under
 * the summary. Once made, everyone sees "Created ✓ KEY" there instead.
 */
export function CreateTaskButton({
  source,
  text,
  author,
  task,
}: {
  source: ItemSource;
  text: string;
  author: UserRef;
  /** The task the item already links to (its project becomes the default). */
  task: StandupTaskRef | null;
}) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { formatDay } = useDates();
  const { day } = useDayView();
  const openCreate = useUiStore((s) => s.openCreate);
  const addTask = useAddSummaryTask(day.group.id, day.date);
  const href = useTaskKeyHref();
  const made = createdFrom(day.summary?.tasks ?? [], source)?.task ?? null;
  const key = sourceKey(source);
  const shape =
    'inline-flex h-6 items-center gap-1 rounded-[6px] border border-accent px-2 text-[12px] font-semibold text-accent-ink no-underline';

  if (made) {
    const to = href(made.key);
    const body = (
      <>
        <CheckIcon size={11} />
        {t('standup.summary.created')}
        <span className="font-mono text-[12px] font-normal">{made.key}</span>
      </>
    );
    return to ? (
      <Link
        to={to}
        data-task-key={made.key}
        data-source={key}
        title={`${made.key} · ${made.title}`}
        className={cn(shape, 'border-solid bg-accent-soft hover:brightness-95')}
      >
        {body}
      </Link>
    ) : (
      <span className={cn(shape, 'border-solid bg-accent-soft')}>{body}</span>
    );
  }
  if (!day.canSummarize) return null;

  const create = (trigger: HTMLElement) => {
    const inGroup = day.members.some((m) => m.user.id === author.id);
    openCreate({
      title: taskTitleOf(text),
      ...(inGroup ? { assigneeId: author.id } : {}),
      ...(task ? { projectId: task.project.id } : {}),
      description: backLinkDoc(
        t('standup.summary.descriptionFrom', {
          group: day.group.name,
          date: formatDay('dateShort', day.date),
        }),
        appUrl(ws(dayHref(day.group.id, day.date))),
      ),
      onCreated: (created) => {
        // Back on the item: its button turns into "Created ✓ KEY" once the task is listed.
        const refocus = () => {
          const link = document.querySelector<HTMLElement>(`[data-source="${key}"]`);
          if (link) link.focus();
          else if (trigger.isConnected) trigger.focus();
        };
        addTask.mutate(
          {
            taskId: created.id,
            sourceKind: source.kind,
            sourceEntryId: source.entryId,
            ...(source.kind === 'blocker'
              ? { sourceBlockerId: source.blockerId }
              : { sourceItemIndex: source.itemIndex }),
          },
          { onSettled: () => window.setTimeout(refocus, 0) },
        );
      },
    });
  };

  return (
    <button
      type="button"
      aria-label={t('standup.summary.createFor', { text })}
      onClick={(e) => {
        create(e.currentTarget);
      }}
      className={cn(shape, 'border-dashed bg-transparent hover:bg-accent-soft')}
    >
      <PlusIcon size={11} />
      {t('standup.summary.create')}
    </button>
  );
}
