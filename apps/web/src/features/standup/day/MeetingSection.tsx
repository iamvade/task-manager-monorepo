import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CreatedTaskCard } from '../live/NotesPanel';
import { useDayView } from './DayContext';

/**
 * The day's meeting on the group page (no design: built from the page's tokens). While it runs,
 * a banner with Join live; once the facilitator saves the notes, a "Meeting notes" section with
 * the notes and the tasks created. Only the total length is shown, never per-person times.
 */
export function MeetingSection() {
  const { t } = useTranslation();
  const { day } = useDayView();
  const meeting = day.meeting;
  if (!meeting) return null;
  const by = meeting.facilitator?.name ?? '';

  return (
    <>
      {meeting.live && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[color:color-mix(in_srgb,var(--accent)_25%,transparent)] bg-accent-soft px-4 py-3 max-sm:hidden">
          <span
            aria-hidden
            className="size-2.5 flex-none rounded-full bg-prio-urgent shadow-[0_0_0_4px_var(--danger-soft)]"
          />
          <p className="m-0 min-w-0 flex-1 text-[14px] font-medium text-default">
            {by ? t('standup.day.liveNowBy', { name: by }) : t('standup.day.liveNow')}
          </p>
          <Link
            to={`/standup/${day.group.id}/${day.date}/live`}
            className="flex h-8 items-center rounded-[8px] bg-accent px-3 text-[13px] font-semibold text-white no-underline hover:brightness-110"
          >
            {t('standup.day.joinLive')}
          </Link>
        </div>
      )}
      {meeting.notesSavedAt && (
        <section
          aria-labelledby="standup-meeting-notes"
          className="flex flex-col gap-3 rounded-[12px] border border-default p-5 max-sm:p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="standup-meeting-notes" className="m-0 text-[15px] font-semibold">
              {t('standup.day.meetingNotes')}
            </h2>
            {by && (
              <span className="text-[12px] text-muted">
                {t('standup.day.meetingBy', {
                  name: by,
                  duration: t('standup.live.minutes', {
                    count: Math.max(1, Math.round((meeting.totalSeconds ?? 0) / 60)),
                  }),
                })}
              </span>
            )}
          </div>
          {meeting.notes?.trim() ? (
            <p className="m-0 text-[14px] leading-[22px] break-words whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
              {meeting.notes}
            </p>
          ) : (
            <p className="m-0 text-[13px] text-muted">{t('standup.day.noMeetingNotes')}</p>
          )}
          {meeting.tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[13px] font-semibold text-2">
                {t('standup.day.meetingTasks')}
              </h3>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-2 p-0">
                {meeting.tasks.map((task) => (
                  <li key={task.task.id}>
                    <CreatedTaskCard task={task} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
