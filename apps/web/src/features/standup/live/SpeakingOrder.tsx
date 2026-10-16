import type { StandupMeeting } from '@kite/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { firstName } from '../day/DayContext';
import { isSkipped } from './meeting';

/**
 * The top bar's speaking order (StandupLive.dc.html): one dot per person with their first name.
 * Current = 16px accent with a soft ring; done (spoke, or before the current person) = solid
 * accent; upcoming = ring;
 * out of office = hatched, struck through, not clickable. The driver jumps by clicking a dot;
 * followers see the same dots as plain text. Scrolls sideways in a big group, keeping the
 * current person in view.
 */
export function SpeakingOrder({
  meeting,
  onPick,
}: {
  meeting: StandupMeeting;
  /** Null for followers (read-only). */
  onPick: ((userId: string) => void) | null;
}) {
  const { t } = useTranslation();
  const currentRef = useRef<HTMLElement | null>(null);
  const currentAt = meeting.order.findIndex((s) => s.user.id === meeting.currentUserId);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [meeting.currentUserId]);

  return (
    <nav
      aria-label={t('standup.live.speakers')}
      className="flex min-w-0 flex-1 justify-center overflow-x-auto max-lg:order-last max-lg:basis-full"
    >
      <ol className="m-0 flex list-none items-center gap-2.5 p-1">
        {meeting.order.map((s, i) => {
          const current = s.user.id === meeting.currentUserId;
          const skipped = isSkipped(s);
          // Done: spoke at some point, or comes before the current person (passed over quickly).
          const done =
            !current &&
            !skipped &&
            ((meeting.durations[s.user.id] ?? 0) > 0 || (currentAt >= 0 && i < currentAt));
          const label = current
            ? t('standup.live.speakingNow', { name: s.user.name })
            : skipped
              ? t('standup.live.outOfOffice', { name: s.user.name })
              : done
                ? t('standup.live.spoke', { name: s.user.name })
                : s.user.name;
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  'box-border rounded-full',
                  current
                    ? 'size-4 bg-accent shadow-[0_0_0_4px_var(--accent-soft)]'
                    : skipped
                      ? 'size-3 border border-strong bg-[repeating-linear-gradient(135deg,var(--out-avatar)_0_2px,var(--surface)_2px_4px)]'
                      : done
                        ? 'size-3 bg-accent'
                        : 'size-3 border-2 border-[color:var(--project-dot-inactive)]',
                )}
              />
              <span
                className={cn(
                  'max-w-[88px] truncate text-[11px] leading-[14px]',
                  current ? 'font-semibold text-default' : 'text-muted',
                  skipped && 'line-through',
                )}
              >
                {firstName(s.user)}
              </span>
            </>
          );
          const shape =
            'flex flex-col items-center gap-1 rounded-[8px] border-0 bg-transparent px-1 py-0.5';
          return (
            <li key={s.user.id} className="flex">
              {onPick && !skipped ? (
                <button
                  ref={current ? (el) => void (currentRef.current = el) : undefined}
                  type="button"
                  aria-label={label}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => {
                    onPick(s.user.id);
                  }}
                  className={cn(shape, 'cursor-pointer hover:bg-hover')}
                >
                  {body}
                </button>
              ) : (
                <span
                  ref={current ? (el) => void (currentRef.current = el) : undefined}
                  role="img"
                  aria-label={label}
                  aria-current={current ? 'step' : undefined}
                  className={shape}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
