import type { StandupMeeting, StandupMeetingTask } from '@kite/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAutosaveMeetingNotes, useSaveMeetingNotes } from '../../../api/standups';
import { Avatar } from '../../../components/ui/Avatar';
import { CountBadge } from '../../../components/ui/CountBadge';
import { cn } from '../../../lib/cn';
import { toast } from '../../../stores/toast';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';
import { firstName } from '../day/DayContext';

export const NOTES_AUTOSAVE_MS = 2000;

/**
 * The notes aside (StandupLive.dc.html): meeting notes (autosaved 2 s after typing; read-only
 * text for followers), the tasks created so far, and "Save notes to standup", which puts both
 * on the day page.
 */
export function NotesPanel({
  meeting,
  groupId,
  date,
  canDrive,
  clock,
}: {
  meeting: StandupMeeting;
  groupId: string;
  date: string;
  canDrive: boolean;
  clock: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const inputId = useId();
  const statusId = useId();
  const autosave = useAutosaveMeetingNotes(groupId, date);
  const publish = useSaveMeetingNotes(groupId, date);
  // My text while I drive; the meeting's (live, from the facilitator) when I follow.
  const [text, setText] = useState(meeting.notes);
  const dirty = useRef(false);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  });

  useEffect(() => {
    if (!canDrive || !dirty.current) return;
    const id = window.setTimeout(() => {
      dirty.current = false;
      autosave.mutate(text);
    }, NOTES_AUTOSAVE_MS);
    return () => {
      window.clearTimeout(id);
    };
    // `autosave` changes identity every render; the text is what restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, canDrive]);

  // Leaving the page with unsaved typing: save it on the way out.
  useEffect(
    () => () => {
      if (dirty.current) autosave.mutate(latest.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const status = autosave.isPending
    ? t('standup.live.notesSaving')
    : autosave.isError
      ? t('standup.live.notesFailed')
      : autosave.isSuccess
        ? t('standup.live.notesSavedDraft')
        : null;

  return (
    <aside
      aria-labelledby={headingId}
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[16px] border border-default bg-surface p-5 text-[14px] leading-5 lg:max-w-[400px]"
    >
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className="m-0 text-[15px] font-semibold">
          {t('standup.live.notes')}
        </h2>
        {canDrive ? (
          <>
            <label htmlFor={inputId} className="sr-only">
              {t('standup.live.notes')}
            </label>
            <textarea
              id={inputId}
              rows={7}
              value={text}
              maxLength={20_000}
              aria-describedby={status ? statusId : undefined}
              onChange={(e) => {
                dirty.current = true;
                setText(e.target.value);
              }}
              className="box-border w-full resize-y rounded-[10px] border border-default bg-surface px-3 py-2.5 text-[14px] leading-[21px] text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <span
              id={statusId}
              role="status"
              className={cn(
                'min-h-4 text-[12px] leading-4',
                autosave.isError ? 'text-danger' : 'text-muted',
              )}
            >
              {status}
            </span>
          </>
        ) : meeting.notes.trim() ? (
          <p className="m-0 text-[14px] leading-[21px] break-words whitespace-pre-wrap text-body">
            {meeting.notes}
          </p>
        ) : (
          <p className="m-0 text-[13px] text-muted">{t('standup.live.noNotes')}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold text-2">
          {t('standup.live.actions')}
          <CountBadge value={meeting.tasks.length} />
        </h3>
        {meeting.tasks.length === 0 ? (
          <p className="m-0 rounded-[10px] border border-dashed border-[color:var(--out-avatar)] p-3 text-[13px] text-muted">
            {t('standup.live.noActions')}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {meeting.tasks.map((task) => (
              <li key={task.task.id}>
                <CreatedTaskCard task={task} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {canDrive && (
        <div className="mt-auto flex flex-col gap-1.5">
          <button
            type="button"
            disabled={publish.isPending}
            onClick={() => {
              dirty.current = false;
              publish.mutate(text, {
                onSuccess: () => {
                  toast({ message: t('standup.live.notesSavedToast') });
                },
              });
            }}
            className="h-10 rounded-[10px] border border-default bg-surface text-[14px] font-medium text-default enabled:hover:bg-hover disabled:opacity-60"
          >
            {t('standup.live.saveNotes')}
          </button>
          {meeting.notesSavedAt && (
            <span className="text-center text-[12px] text-muted">
              {t('standup.live.notesSavedAt', { time: clock(meeting.notesSavedAt) })}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

/** A task made in the meeting: opens the drawer; "From Temuulen's blocker · App Redesign". */
export function CreatedTaskCard({ task }: { task: StandupMeetingTask }) {
  const { t } = useTranslation();
  const href = useTaskKeyHref()(task.task.key);
  const name = task.source.user ? firstName(task.source.user) : '?';
  const meta = t(
    task.source.kind === 'blocker' ? 'standup.live.fromBlocker' : 'standup.live.fromPlan',
    {
      name,
      project: task.task.project.name,
    },
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
    'flex items-start gap-2.5 rounded-[10px] border border-subtle px-3 py-2.5 text-default no-underline';
  return href ? (
    <Link to={href} data-task-key={task.task.key} className={cn(shape, 'hover:bg-hover')}>
      {body}
    </Link>
  ) : (
    <div className={shape}>{body}</div>
  );
}
