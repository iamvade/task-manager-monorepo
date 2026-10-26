import { dateSchema, type StandupDay, type StandupMeetingState } from '@kite/shared';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';
import {
  useAddMeetingTask,
  useAdvanceMeeting,
  useEndMeeting,
  useStandupDay,
  useStandupMeeting,
  useStartMeeting,
} from '../../../api/standups';
import { ApiError } from '../../../api/client';
import { queryKeys } from '@kite/shared/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../auth/useAuth';
import { ErrorState } from '../../../components/ErrorState';
import { PlayIcon } from '../../../components/icons';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { DEFAULT_TIMEZONE } from '../../../lib/dates';
import { isEditableTarget } from '../../../lib/keyboard';
import { formatClock } from '../../../lib/relativeTime';
import { useDates } from '../../../lib/useDates';
import { useUiStore } from '../../../stores/ui';
import { dayHref } from '../day/links';
import { CreatedTaskCard, NotesPanel } from './NotesPanel';
import { SpeakerPanel, type CreateRequest } from './SpeakerPanel';
import { SpeakingOrder } from './SpeakingOrder';
import {
  backLinkDoc,
  clockLabel,
  entryOf,
  neighbor,
  spokenSeconds,
  taskTitleOf,
  totalSeconds,
} from './meeting';
import { useMeetingClock } from './useMeetingClock';
import { useWsPath } from '../../../api/workspaces';
import { useOtherWorkspacePath } from '../../workspace/useOtherWorkspacePath';

/**
 * `/standup/:groupId/:date/live` (StandupLive.dc.html): the screen-shared meeting, full screen
 * without the app shell. The facilitator drives (Previous / Next, ← →, a click in the order,
 * Create task, notes); everyone else in the group follows the same state read-only. Timing is
 * shown here only.
 */
export function StandupLivePage() {
  const ws = useWsPath();
  const { groupId = '', date = '' } = useParams();
  const valid = dateSchema.safeParse(date).success;
  const day = useStandupDay(groupId, date, { enabled: valid });
  const meeting = useStandupMeeting(groupId, date, valid && day.isSuccess);
  const elsewhere = useOtherWorkspacePath(day.data?.group.workspaceId);
  if (elsewhere) return <Navigate to={elsewhere} replace />;
  if (!valid) return <Navigate to={ws(`/standup/${groupId}`)} replace />;
  if (day.error instanceof ApiError && day.error.status === 403) return <MembersOnly />;
  if (day.isError) return <Frame>{<ErrorState error={day.error} />}</Frame>;
  if (meeting.isError) return <Frame>{<ErrorState error={meeting.error} />}</Frame>;
  if (!day.data || !meeting.data) return <LiveSkeleton />;
  return <Live day={day.data} state={meeting.data} fetchedAt={meeting.dataUpdatedAt} />;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col bg-subtle">{children}</div>;
}

function MembersOnly() {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { groupId = '' } = useParams();
  return (
    <Frame>
      <EmptyState
        body={t('standup.day.membersOnly')}
        actions={
          <Link to={ws(`/standup/${groupId}`)} className="text-[13px] font-medium text-accent-ink">
            {t('standup.live.backToStandup')}
          </Link>
        }
      />
    </Frame>
  );
}

function Live({
  day,
  state,
  fetchedAt,
}: {
  day: StandupDay;
  state: StandupMeetingState;
  fetchedAt: number;
}) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { me } = useAuth();
  const { formatDay } = useDates();
  const queryClient = useQueryClient();
  const openCreate = useUiStore((s) => s.openCreate);
  const createOpen = useUiStore((s) => s.createOpen);
  const group = day.group;
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const clock = useCallback((iso: string) => formatClock(new Date(iso), zone), [zone]);
  const meeting = state.meeting;
  const canDrive = state.canDrive;
  const running = Boolean(meeting?.startedAt && !meeting.endedAt);
  const now = useMeetingClock(state.serverNow, fetchedAt, running);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const start = useStartMeeting(group.id, day.date);
  const advance = useAdvanceMeeting(group.id, day.date);
  const end = useEndMeeting(group.id, day.date);
  const addTask = useAddMeetingTask(group.id, day.date);

  const speaker = meeting?.order.find((s) => s.user.id === meeting.currentUserId) ?? null;
  const prev = meeting && speaker ? neighbor(meeting, speaker.user.id, -1) : null;
  const next = meeting && speaker ? neighbor(meeting, speaker.user.id, 1) : null;

  const go = (userId: string) => {
    if (!canDrive || !running) return;
    advance.mutate(userId);
  };
  const finish = () => {
    end.mutate();
  };
  const goNext = () => {
    if (next) go(next.user.id);
    else finish();
  };
  const goPrev = () => {
    if (prev) go(prev.user.id);
  };

  // ← → move between people (the driver only; not while typing or in an overlay).
  useEffect(() => {
    if (!canDrive || !running) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (createOpen || isEditableTarget(event.target, true)) return;
      if (new URLSearchParams(window.location.search).has('task')) return;
      // Arrow keys inside the speaking order move between its buttons natively.
      if (event.target instanceof HTMLElement && event.target.closest('nav')) return;
      event.preventDefault();
      if (event.key === 'ArrowRight') {
        // "Finish" ends the meeting: only from the button, never by a stray key.
        if (next) go(next.user.id);
      } else goPrev();
      const active = document.activeElement;
      if (active === document.body || active?.id === 'main') headingRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const onCreate = (req: CreateRequest) => {
    const href = `${window.location.origin}${ws(dayHref(group.id, day.date))}`;
    const projectId = req.task?.project.id;
    openCreate({
      title: taskTitleOf(req.text),
      assigneeId: req.speaker.user.id,
      ...(projectId ? { projectId } : {}),
      description: backLinkDoc(
        t('standup.live.descriptionFrom', {
          group: group.name,
          date: formatDay('dateShort', day.date),
        }),
        href,
      ),
      onCreated: (task) => {
        // Back on the item the task came from: its button turns into "Created" once listed.
        const refocus = () => {
          const created = document.querySelector<HTMLElement>(
            `#live-speaker [data-task-key="${task.key}"]`,
          );
          if (created) created.focus();
          else if (req.trigger.isConnected) req.trigger.focus();
          else headingRef.current?.focus();
        };
        addTask.mutate(
          {
            taskId: task.id,
            sourceKind: req.source.kind,
            sourceEntryId: req.source.entryId,
            ...(req.source.kind === 'blocker'
              ? { sourceBlockerId: req.source.blockerId }
              : { sourceItemIndex: req.source.itemIndex }),
          },
          { onSettled: () => window.setTimeout(refocus, 0) },
        );
      },
    });
  };

  // Refresh the day (the boxes) when someone posts or edits mid-meeting: the realtime handler
  // invalidates the group; nothing to do here. When the meeting ends, the day page shows it.
  useEffect(() => {
    if (meeting?.endedAt) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.standupDays(group.id) });
    }
  }, [meeting?.endedAt, group.id, queryClient]);

  const back = ws(dayHref(group.id, day.date, day.today));
  const facilitator = meeting?.facilitator ?? null;
  const meetingTime = day.meetingAt ? clock(day.meetingAt) : null;
  const target = group.totalMeetingMinutes * 60;
  const total = meeting ? totalSeconds(meeting, now) : 0;

  const topBar = (
    <header className="box-border flex min-h-16 flex-wrap items-center gap-4 border-b border-default bg-surface px-6 py-2.5 max-sm:px-4">
      <div className="flex min-w-[240px] items-center gap-2.5 max-sm:min-w-0">
        <span
          aria-hidden
          className={
            running
              ? 'size-2.5 flex-none rounded-full bg-prio-urgent shadow-[0_0_0_4px_var(--danger-soft)]'
              : 'size-2.5 flex-none rounded-full bg-[color:var(--project-dot-inactive)]'
          }
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold break-words">
            {t('standup.live.pageTitle', { group: group.name })}
            {running && <span className="sr-only"> · {t('standup.live.live')}</span>}
          </span>
          <span className="text-[12px] leading-4 text-muted">
            {meetingTime
              ? t('standup.live.sub', {
                  date: formatDay('weekdayLongDate', day.date),
                  time: meetingTime,
                })
              : formatDay('weekdayLongDate', day.date)}
          </span>
        </div>
      </div>
      {meeting ? (
        <SpeakingOrder meeting={meeting} onPick={canDrive && running ? go : null} />
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-3">
        {meeting && (
          <span className="flex flex-col items-end">
            <span className="text-[12px] leading-4 text-muted">{t('standup.live.total')}</span>
            <span
              role="timer"
              aria-label={t('standup.live.total')}
              className={
                total > target
                  ? 'text-[15px] font-semibold text-warning tabular-nums'
                  : 'text-[15px] font-semibold tabular-nums'
              }
            >
              {clockLabel(total)}{' '}
              <span className="font-normal text-muted">/ {clockLabel(target)}</span>
            </span>
          </span>
        )}
        {canDrive && running ? (
          <button
            type="button"
            onClick={finish}
            disabled={end.isPending}
            className="flex h-9 items-center rounded-[8px] border border-default bg-surface px-3.5 text-[14px] font-medium text-default enabled:hover:bg-hover"
          >
            {t('standup.live.end')}
          </button>
        ) : (
          <Link
            to={back}
            className="flex h-9 items-center rounded-[8px] border border-default bg-surface px-3.5 text-[14px] font-medium text-default no-underline hover:bg-hover"
          >
            {t('standup.live.backToStandup')}
          </Link>
        )}
      </div>
    </header>
  );

  let body: ReactNode;
  if (!meeting) {
    body = (
      <NotStarted
        day={day}
        canDrive={canDrive}
        starting={start.isPending}
        onStart={() => {
          start.mutate(undefined, {
            onSuccess: () => {
              headingRef.current?.focus();
            },
          });
        }}
      />
    );
  } else if (meeting.endedAt) {
    body = (
      <section
        aria-labelledby="live-ended"
        className="flex min-w-0 flex-[999_1_640px] flex-col gap-4 rounded-[16px] border border-default bg-surface px-8 py-7 max-sm:px-5"
      >
        <h1
          id="live-ended"
          ref={headingRef}
          tabIndex={-1}
          className="m-0 text-[28px] leading-8 font-semibold tracking-[-0.01em] outline-none"
        >
          {t('standup.live.ended')}
        </h1>
        <p className="m-0 text-[15px] text-3">
          {t('standup.live.endedSummary', {
            count: meeting.tasks.length,
            duration: t('standup.live.minutes', {
              count: Math.max(1, Math.round((meeting.totalSeconds ?? 0) / 60)),
            }),
          })}
        </p>
        {meeting.tasks.length > 0 && (
          <ul className="m-0 flex max-w-[560px] list-none flex-col gap-2 p-0">
            {meeting.tasks.map((task) => (
              <li key={task.task.id}>
                <CreatedTaskCard task={task} />
              </li>
            ))}
          </ul>
        )}
        <div>
          <Link
            to={back}
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[14px] font-semibold text-white no-underline hover:brightness-110"
          >
            {t('standup.live.backToStandup')}
          </Link>
        </div>
      </section>
    );
  } else if (speaker) {
    const limit = group.secondsPerPerson;
    body = (
      <SpeakerPanel
        meeting={meeting}
        speaker={speaker}
        entry={entryOf(day.entries, speaker)}
        seconds={spokenSeconds(meeting, speaker.user.id, now)}
        limitSeconds={limit}
        clock={clock}
        headingRef={headingRef}
        prev={prev}
        next={next}
        onPrev={canDrive ? goPrev : null}
        onNext={canDrive ? goNext : null}
        onCreate={canDrive ? onCreate : null}
        footerNote={
          canDrive
            ? undefined
            : next
              ? t('standup.live.upNext', { name: next.user.name })
              : t('standup.live.last')
        }
      />
    );
  } else {
    body = null;
  }

  const speakers = meeting?.order.filter((s) => s.state !== 'out' || s.entryId).length ?? 0;
  const long = speakers * group.secondsPerPerson > target;

  return (
    <div className="flex min-h-full flex-col bg-subtle text-[16px] leading-6 text-default">
      {topBar}
      {!canDrive && running && facilitator && (
        <p className="m-0 border-b border-default bg-accent-soft px-6 py-2 text-[13px] text-accent-ink max-sm:px-4">
          {t('standup.live.followingHint', { name: facilitator.name })}
        </p>
      )}
      <div className="flex flex-1 flex-wrap gap-5 px-6 pt-5 pb-6 max-sm:px-4">
        {body}
        {meeting && (
          <NotesPanel
            key={meeting.id}
            meeting={meeting}
            groupId={group.id}
            date={day.date}
            canDrive={canDrive}
            clock={clock}
          />
        )}
      </div>
      {canDrive && running && long && (
        <p className="m-0 px-6 pb-4 text-[13px] text-muted max-sm:px-4">
          {t('standup.live.longMeeting', {
            people: speakers,
            minutes: Math.round(group.secondsPerPerson / 60),
            total: group.totalMeetingMinutes,
          })}
        </p>
      )}
    </div>
  );
}

/** Before the start: Start for the driver (or why it can't start), a note for followers. */
function NotStarted({
  day,
  canDrive,
  starting,
  onStart,
}: {
  day: StandupDay;
  canDrive: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const facilitator = day.group.members.find((m) => m.user.id === day.group.facilitatorId);
  const speakers = day.members.filter((m) => m.state !== 'out').length;
  const reason = !day.group.meetingAt
    ? t('standup.live.noMeetingTime')
    : day.date !== day.today || !day.isStandupDay || day.group.archivedAt
      ? t('standup.live.notToday')
      : speakers === 0
        ? t('standup.live.everyoneOut')
        : null;
  return (
    <section
      aria-labelledby="live-not-started"
      className="flex min-w-0 flex-[999_1_640px] flex-col items-start gap-3 rounded-[16px] border border-default bg-surface px-8 py-7 max-sm:px-5"
    >
      <h1
        id="live-not-started"
        tabIndex={-1}
        className="m-0 text-[28px] leading-8 font-semibold tracking-[-0.01em] outline-none"
      >
        {t('standup.live.notStarted')}
      </h1>
      <p className="m-0 max-w-[560px] text-[15px] text-3">
        {reason ??
          (canDrive
            ? t('standup.live.notStartedDriver')
            : facilitator
              ? t('standup.live.notStartedFollower', { name: facilitator.user.name })
              : t('standup.live.notStartedNobody'))}
      </p>
      {canDrive && !reason && (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-1 flex h-10 items-center gap-2 rounded-[8px] border-0 bg-accent px-4 text-[14px] font-semibold text-white enabled:hover:brightness-110 disabled:opacity-60"
        >
          <PlayIcon size={14} />
          {t('standup.day.startStandup')}
        </button>
      )}
    </section>
  );
}

function LiveSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-full flex-col gap-5 bg-subtle">
      <Skeleton height={64} />
      <div className="flex gap-5 px-6">
        <Skeleton height={420} />
      </div>
    </div>
  );
}
