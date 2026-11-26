import type { StandupMeetingTask } from '@kite/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSaveStandupSummary } from '../../../api/standups';
import { Avatar } from '../../../components/ui/Avatar';
import { CountBadge } from '../../../components/ui/CountBadge';
import { MAX_MEETING_NOTES } from '@kite/shared';
import { cn } from '../../../lib/cn';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';
import { firstName, useDayView } from './DayContext';

export const SUMMARY_AUTOSAVE_MS = 2000;

/**
 * The day's meeting summary (not designed: built from the page's tokens). Whoever facilitates
 * (`canSummarize`) writes it here, autosaved 2 s after typing; everyone in the group reads it at
 * once. Tasks made with "Create task" on Today items and blockers are listed below it.
 */
export function SummarySection() {
  const { t } = useTranslation();
  const { day } = useDayView();
  const headingId = useId();
  const summary = day.summary;
  const tasks = summary?.tasks ?? [];
  const notes = summary?.notes ?? '';
  if (!day.canSummarize && !notes.trim() && tasks.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[12px] border border-default p-5 max-sm:p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="m-0 text-[15px] font-semibold">
          {t('standup.summary.title')}
        </h2>
        {summary?.updatedBy && notes.trim() && (
          <span className="text-[12px] text-muted">
            {t('standup.summary.by', { name: summary.updatedBy.name })}
          </span>
        )}
      </div>
      {day.canSummarize ? (
        <SummaryEditor key={`${day.group.id}-${day.date}`} serverNotes={notes} />
      ) : (
        notes.trim() && (
          <p className="m-0 text-[14px] leading-[22px] break-words whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
            {notes}
          </p>
        )
      )}
      {(tasks.length > 0 || day.canSummarize) && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold text-2">
            {t('standup.summary.tasks')}
            <CountBadge value={tasks.length} />
          </h3>
          {tasks.length === 0 ? (
            <p className="m-0 rounded-[10px] border border-dashed border-[color:var(--out-avatar)] p-3 text-[13px] text-muted">
              {t('standup.summary.noTasks')}
            </p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-2 p-0">
              {tasks.map((task) => (
                <li key={task.task.id}>
                  <CreatedTaskCard task={task} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The facilitator's textarea. It keeps its own text while typing; the server's copy (another
 * facilitator's edit, a refetch after someone posts) replaces it only when nothing is unsaved.
 */
function SummaryEditor({ serverNotes }: { serverNotes: string }) {
  const { t } = useTranslation();
  const { day } = useDayView();
  const inputId = useId();
  const statusId = useId();
  const save = useSaveStandupSummary(day.group.id, day.date);
  const [text, setText] = useState(serverNotes);
  const dirty = useRef(false);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  });

  // Someone else's newer text, when mine is all saved.
  useEffect(() => {
    if (!dirty.current && !save.isPending) setText(serverNotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverNotes]);

  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => {
      dirty.current = false;
      save.mutate(text);
    }, SUMMARY_AUTOSAVE_MS);
    return () => {
      window.clearTimeout(id);
    };
    // `save` changes identity every render; the text is what restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Leaving the page (or another day) with unsaved typing: save it on the way out.
  useEffect(
    () => () => {
      if (dirty.current) save.mutate(latest.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const flush = () => {
    if (!dirty.current) return;
    dirty.current = false;
    save.mutate(latest.current);
  };

  const status = save.isPending
    ? t('standup.summary.saving')
    : save.isError
      ? t('standup.summary.failed')
      : save.isSuccess
        ? t('standup.summary.saved')
        : null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="sr-only">
        {t('standup.summary.title')}
      </label>
      <textarea
        id={inputId}
        rows={4}
        value={text}
        maxLength={MAX_MEETING_NOTES}
        placeholder={t('standup.summary.placeholder')}
        aria-describedby={statusId}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        onBlur={flush}
        className="box-border w-full resize-y rounded-[10px] border border-default bg-surface px-3 py-2.5 text-[14px] leading-[21px] text-body outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      <span
        id={statusId}
        role="status"
        className={cn('min-h-4 text-[12px] leading-4', save.isError ? 'text-danger' : 'text-muted')}
      >
        {status ?? t('standup.summary.hint')}
      </span>
    </div>
  );
}

/** A task made from an item: opens the drawer; "From Temuulen's blocker · App Redesign". */
export function CreatedTaskCard({ task }: { task: StandupMeetingTask }) {
  const { t } = useTranslation();
  const href = useTaskKeyHref()(task.task.key);
  const name = task.source.user ? firstName(task.source.user) : '?';
  const meta = t(
    task.source.kind === 'blocker' ? 'standup.summary.fromBlocker' : 'standup.summary.fromPlan',
    { name, project: task.task.project.name },
  );
  const body = (
    <>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="mt-0.5 flex-none text-accent-ink"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M12 8v8M8 12h8" />
      </svg>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium break-words [overflow-wrap:anywhere]">{task.task.title}</span>
        <span className="text-[12px] text-muted">{meta}</span>
      </span>
      {task.assignee && <Avatar user={task.assignee} size={22} textSize={9} />}
    </>
  );
  const shape =
    'flex items-start gap-2.5 rounded-[10px] border border-default px-3 py-2.5 text-[14px] text-default no-underline';
  return href ? (
    <Link to={href} data-task-key={task.task.key} className={cn(shape, 'hover:bg-hover')}>
      {body}
    </Link>
  ) : (
    <div className={shape}>{body}</div>
  );
}
