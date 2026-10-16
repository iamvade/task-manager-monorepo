import type {
  StandupEntry,
  StandupMeeting,
  StandupMeetingSpeaker,
  StandupTaskRef,
} from '@kite/shared';
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, NextIcon, PlusIcon, PrevIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { cn } from '../../../lib/cn';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';
import { Link } from 'react-router';
import { TaskChip } from '../day/TaskChip';
import { clockLabel, createdFrom, type ItemSource } from './meeting';

const kbd =
  'rounded-[4px] border border-b-2 border-default px-[5px] font-sans text-[12px] leading-4 text-muted';

export interface CreateRequest {
  speaker: StandupMeetingSpeaker;
  text: string;
  task: StandupTaskRef | null;
  source: ItemSource;
  /** The Create button, so focus returns to it after quick create. */
  trigger: HTMLElement;
}

/**
 * The current person in a big, screen-share-friendly layout (StandupLive.dc.html): avatar, name
 * (announced politely), role · posted time, their timer with a bar that turns warm past the
 * limit (no sound), then Yesterday / Today / Blockers and Previous · Up next · Next.
 */
export function SpeakerPanel({
  meeting,
  speaker,
  entry,
  seconds,
  limitSeconds,
  clock,
  headingRef,
  prev,
  next,
  onPrev,
  onNext,
  onCreate,
  footerNote,
}: {
  meeting: StandupMeeting;
  speaker: StandupMeetingSpeaker;
  entry: StandupEntry | null;
  seconds: number;
  limitSeconds: number;
  clock: (iso: string) => string;
  headingRef: MutableRefObject<HTMLHeadingElement | null>;
  prev: StandupMeetingSpeaker | null;
  next: StandupMeetingSpeaker | null;
  /** Null for followers. */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onCreate: ((request: CreateRequest) => void) | null;
  /** Shown in the footer instead of the controls (followers). */
  footerNote?: ReactNode;
}) {
  const { t } = useTranslation();
  const over = seconds > limitSeconds;
  const sectionsRef = useRef<HTMLDivElement | null>(null);
  const subtitle = [
    speaker.title,
    speaker.postedAt
      ? t('standup.live.posted', { time: clock(speaker.postedAt) })
      : t('standup.live.notPosted'),
  ]
    .filter(Boolean)
    .join(' · ');

  // A new speaker replaces the boxes: if focus was in them (or got lost), put it on the name.
  useEffect(() => {
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      active.id === 'main' ||
      !active.isConnected ||
      sectionsRef.current?.contains(active)
    ) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [speaker.user.id, headingRef]);

  const todayItems = (entry?.today ?? []).map((it, i) => ({
    key: `t${i}`,
    text: it.text,
    task: it.task,
    source: { kind: 'today' as const, entryId: entry?.id ?? '', itemIndex: i },
  }));
  const blockerItems = (entry?.blockers ?? []).map((b) => ({
    key: b.id,
    text: b.text,
    task: b.task,
    source: { kind: 'blocker' as const, entryId: entry?.id ?? '', blockerId: b.id },
  }));
  const actionable = (items: typeof todayItems | typeof blockerItems) =>
    items.map((it) => {
      const made = createdFrom(meeting.tasks, it.source)?.task ?? null;
      return (
        <Item key={it.key} text={it.text} task={it.task}>
          {(onCreate ?? made) && (
            <CreateButton
              text={it.text}
              made={made}
              onCreate={
                onCreate
                  ? (trigger) => {
                      onCreate({
                        speaker,
                        text: it.text,
                        task: it.task,
                        source: it.source,
                        trigger,
                      });
                    }
                  : null
              }
            />
          )}
        </Item>
      );
    });

  return (
    <section
      id="live-speaker"
      aria-label={speaker.user.name}
      className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 rounded-[16px] border border-default bg-surface px-8 py-7 max-sm:px-5 max-sm:py-5"
    >
      <div className="flex flex-wrap items-center gap-5">
        <Avatar user={speaker.user} size={72} textSize={24} title={null} />
        <div className="flex min-w-[240px] flex-1 flex-col gap-0.5 max-sm:min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            aria-live="polite"
            className="m-0 text-[34px] leading-10 font-semibold tracking-[-0.01em] break-words outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {speaker.user.name}
          </h1>
          <span className="text-[15px] text-3">{subtitle}</span>
        </div>
        <div className="flex min-w-[200px] flex-col items-end gap-1.5">
          <span
            role="timer"
            aria-label={t('standup.live.timeOf', { name: speaker.user.name })}
            className={cn(
              'text-[40px] leading-[44px] font-semibold tabular-nums',
              over ? 'text-warning' : 'text-default',
            )}
          >
            {clockLabel(seconds)}
            {over && <span className="sr-only"> · {t('standup.live.overTime')}</span>}
          </span>
          <div
            aria-hidden
            className="flex h-1.5 w-[200px] overflow-hidden rounded-[3px] bg-[color:var(--progress-track)]"
          >
            <span
              className={cn(
                'h-1.5 rounded-[3px] transition-[width] duration-700 ease-linear',
                over ? 'bg-[color:var(--status-progress)]' : 'bg-accent',
              )}
              style={{ width: `${Math.min(100, (seconds / limitSeconds) * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-[13px] text-muted">
            {t('standup.live.perPerson', { count: Math.round(limitSeconds / 60) })}
          </span>
        </div>
      </div>

      <div
        ref={sectionsRef}
        key={speaker.user.id}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5"
      >
        <Box tone="yesterday" label={t('standup.live.yesterday')}>
          {entry && entry.yesterday.length > 0 ? (
            entry.yesterday.map((it, i) => <Item key={i} text={it.text} task={it.task} />)
          ) : (
            <Empty>{t('standup.live.nothing')}</Empty>
          )}
        </Box>
        <Box tone="today" label={t('standup.live.today')}>
          {todayItems.length > 0 ? (
            actionable(todayItems)
          ) : (
            <Empty>{t('standup.live.nothing')}</Empty>
          )}
        </Box>
        <Box tone="blockers" label={t('standup.live.blockers')}>
          {blockerItems.length > 0 ? (
            actionable(blockerItems)
          ) : (
            <Empty>{t('standup.live.noBlockers')}</Empty>
          )}
        </Box>
      </div>

      {/* Stays in view when a long update scrolls (the driver reaches Next without scrolling). */}
      <div className="sticky bottom-0 z-[1] -mx-8 -mb-7 mt-auto flex flex-wrap items-center gap-3 rounded-b-[16px] border-t border-[color:var(--chip)] bg-surface px-8 pt-4 pb-7 max-sm:-mx-5 max-sm:-mb-5 max-sm:px-5 max-sm:pb-5">
        {onPrev && (
          <button
            type="button"
            aria-disabled={prev ? undefined : 'true'}
            onClick={() => {
              if (prev) onPrev();
            }}
            className={cn(
              'flex h-12 items-center gap-2 rounded-[10px] border border-default bg-surface px-[18px] text-[15px] font-medium',
              prev ? 'text-default hover:bg-hover' : 'cursor-not-allowed text-muted',
            )}
          >
            <PrevIcon size={18} />
            {t('standup.live.prev')}
          </button>
        )}
        <span className="min-w-0 flex-1 text-center text-[14px] text-muted">
          {footerNote ?? (
            <>
              {next ? t('standup.live.upNext', { name: next.user.name }) : t('standup.live.last')}
              {onNext && (
                <span aria-hidden className="max-sm:hidden">
                  {' · '}
                  <kbd className={kbd}>←</kbd> <kbd className={kbd}>→</kbd>
                </span>
              )}
            </>
          )}
        </span>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            aria-keyshortcuts="ArrowRight"
            className="flex h-12 items-center gap-2 rounded-[10px] border-0 bg-accent px-[22px] text-[15px] font-semibold text-white hover:brightness-110"
          >
            {next ? t('standup.live.next') : t('standup.live.finish')}
            <NextIcon size={18} />
          </button>
        )}
      </div>
    </section>
  );
}

const TONES = {
  yesterday: {
    box: 'border-[color:var(--chip)] bg-subtle',
    dot: 'bg-[color:var(--text-faint)]',
    label: 'text-3',
  },
  today: {
    box: 'border-[color:color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)]',
    dot: 'bg-accent',
    label: 'text-accent-ink',
  },
  blockers: {
    box: 'border-[color:var(--danger-card-border)] bg-[color:var(--danger-card-bg)]',
    dot: 'bg-[color:var(--prio-urgent)]',
    label: 'text-[color:var(--danger-soft-fg)]',
  },
} as const;

function Box({
  tone,
  label,
  children,
}: {
  tone: keyof typeof TONES;
  label: string;
  children: ReactNode;
}) {
  const s = TONES[tone];
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-[12px] border p-[18px]', s.box)}>
      <h2 className={cn('m-0 flex items-center gap-2 text-[15px] font-semibold', s.label)}>
        <span aria-hidden className={cn('size-2 flex-none rounded-full', s.dot)} />
        {label}
      </h2>
      {children}
    </section>
  );
}

function Item({
  text,
  task,
  children,
}: {
  text: string;
  task: StandupTaskRef | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[20px] leading-7 break-words text-default [overflow-wrap:anywhere]">
        {text}
      </span>
      {(task ?? children) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {task && <TaskChip task={task} size="xl" label={task.title === text ? 'key' : 'title'} />}
          {children}
        </div>
      )}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="m-0 text-[15px] text-muted">{children}</p>
);

/**
 * "Create task" (28px, dashed accent). Once the task exists it reads "Created ✓" (solid border,
 * accent-soft) and opens the task.
 */
function CreateButton({
  text,
  made,
  onCreate,
}: {
  text: string;
  made: StandupTaskRef | null;
  onCreate: ((trigger: HTMLElement) => void) | null;
}) {
  const { t } = useTranslation();
  const href = useTaskKeyHref()(made?.key ?? '');
  const shape =
    'inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-accent px-2.5 text-[13px] font-semibold text-accent-ink no-underline';
  if (made) {
    const body = (
      <>
        <CheckIcon size={12} />
        {t('standup.live.created')}
        <span className="font-mono text-[12px] font-normal">{made.key}</span>
      </>
    );
    return href ? (
      <Link
        to={href}
        data-task-key={made.key}
        title={`${made.key} · ${made.title}`}
        className={cn(shape, 'border-solid bg-accent-soft hover:brightness-95')}
      >
        {body}
      </Link>
    ) : (
      <span className={cn(shape, 'border-solid bg-accent-soft')}>{body}</span>
    );
  }
  if (!onCreate) return null;
  return (
    <button
      type="button"
      aria-label={t('standup.live.createFor', { text })}
      onClick={(e) => {
        onCreate(e.currentTarget);
      }}
      className={cn(shape, 'border-dashed bg-transparent hover:bg-accent-soft')}
    >
      <PlusIcon size={12} />
      {t('standup.live.create')}
    </button>
  );
}
