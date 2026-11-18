import { weekdayIndex, type OutlookShowAs } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useDates, WEEKDAYS } from '../../lib/useDates';
import type { CalendarMode } from '../../stores/ui';
import type { CalendarDay } from '../calendar/calendarGrid';

import type { Block, Placed } from './useBlocksByDay';

/** A month cell shows this many; more → one fewer + "+N more" (opens that week). */
const MONTH_MAX = 3;

const chipTone: Record<OutlookShowAs, string> = {
  busy: 'bg-accent-soft text-accent-ink',
  tentative: 'border border-dashed border-accent-ink text-accent-ink',
  oof: 'bg-tint-hold text-tint-hold',
  elsewhere: 'bg-chip text-2',
  free: 'bg-subtle text-muted',
};

/** "09:30", "09:30–10:00", or "All day". */
function useTimeLabel() {
  const { t } = useTranslation();
  return (p: Placed, range: boolean) => {
    if (p.block.allDay) return t('outlook.allDay');
    if (!range) return p.startTime ?? '';
    if (p.startTime && p.endTime) return `${p.startTime}–${p.endTime}`;
    if (p.startTime) return t('outlook.from', { time: p.startTime });
    if (p.endTime) return t('outlook.until', { time: p.endTime });
    return t('outlook.allDay');
  };
}

function useBlockTitle() {
  const { t } = useTranslation();
  return (block: Block) =>
    block.title !== undefined
      ? block.title || t('outlook.untitled')
      : t(`outlook.showAs.${block.showAs}`);
}

function Chip({ placed, variant }: { placed: Placed; variant: 'month' | 'week' }) {
  const { t } = useTranslation();
  const time = useTimeLabel();
  const title = useBlockTitle()(placed.block);
  const showAs = placed.block.showAs;
  // Screen readers hear the full sentence; "Busy" etc. is added when the title doesn't say it.
  const status =
    placed.block.title !== undefined && showAs !== 'busy' ? t(`outlook.showAs.${showAs}`) : null;
  const label = [time(placed, true), title, placed.block.location, status]
    .filter(Boolean)
    .join(', ');
  if (variant === 'month') {
    return (
      <li
        aria-label={label}
        title={label}
        className={cn(
          'box-border flex h-[22px] items-center gap-1 overflow-hidden rounded-[6px] px-1.5 text-[12px] font-medium whitespace-nowrap',
          chipTone[showAs],
        )}
      >
        {!placed.block.allDay && placed.startTime && (
          <span aria-hidden="true" className="flex-none tabular-nums">
            {placed.startTime}
          </span>
        )}
        <span aria-hidden="true" className="truncate">
          {title}
        </span>
      </li>
    );
  }
  return (
    <li
      aria-label={label}
      className={cn('flex flex-col gap-0.5 rounded-[8px] p-2 text-[12px]', chipTone[showAs])}
    >
      <span aria-hidden="true" className="font-medium tabular-nums">
        {time(placed, true)}
      </span>
      <span aria-hidden="true" className="font-medium break-words text-default">
        {title}
      </span>
      {placed.block.location && (
        <span aria-hidden="true" className="break-words text-2">
          {placed.block.location}
        </span>
      )}
    </li>
  );
}

function DayNumber({ day, size }: { day: CalendarDay; size: 24 | 26 }) {
  const dates = useDates();
  const d = Number(day.date.slice(8));
  const today = day.date === dates.today;
  return (
    <span
      className={cn(
        'box-border flex items-center justify-center rounded-full px-1 whitespace-nowrap',
        size === 24
          ? 'h-6 min-w-6 text-[12px] font-medium'
          : 'h-[26px] min-w-[26px] text-[14px] font-semibold',
        today ? 'bg-accent font-semibold text-white' : day.inPeriod ? 'text-2' : 'text-muted',
      )}
    >
      {d === 1 ? dates.formatDay('dateShort', day.date) : d}
    </span>
  );
}

const cellBackground = (day: CalendarDay) =>
  !day.inPeriod ? 'bg-subtle' : day.weekend ? 'bg-calendar-weekend' : 'bg-default';

interface GridProps {
  mode: CalendarMode;
  days: readonly CalendarDay[];
  byDay: Map<string, Placed[]>;
  /** "+N more" in a month cell: show that day's week. */
  onOpenWeek: (date: string) => void;
}

/** Month grid (Monday first) or week columns of Outlook events; read-only. */
export function OutlookGrid({ mode, days, byDay, onOpenWeek }: GridProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const dayLabel = (day: CalendarDay, count: number) =>
    t('outlook.dayLabel', { date: dates.formatDay('weekdayLongDate', day.date), count });

  if (mode === 'week') {
    return (
      <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-[12px] border border-default">
        {days.map((day) => {
          const items = byDay.get(day.date) ?? [];
          const weekday = WEEKDAYS[weekdayIndex(day.date)] ?? 'mon';
          return (
            <section
              key={day.date}
              aria-label={dayLabel(day, items.length)}
              className={cn(
                'flex min-h-[520px] min-w-0 flex-col border-r border-subtle last:border-r-0',
                cellBackground(day),
              )}
            >
              <div className="flex h-11 flex-none items-center gap-2 border-b border-subtle px-2.5">
                <span className="text-[12px] font-medium text-muted">
                  {t(`calendar.weekdays.short.${weekday}`)}
                </span>
                <DayNumber day={day} size={26} />
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-2">
                {items.map((p) => (
                  <Chip key={p.key} placed={p} variant="week" />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-w-[720px] overflow-hidden rounded-[12px] border border-default">
      <div className="grid grid-cols-7 border-b border-subtle bg-subtle" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2.5 py-2 text-[12px] font-medium text-muted">
            {t(`calendar.weekdays.short.${w}`)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = byDay.get(day.date) ?? [];
          const shown = items.length <= MONTH_MAX ? items : items.slice(0, MONTH_MAX - 1);
          const more = items.length - shown.length;
          return (
            <section
              key={day.date}
              aria-label={dayLabel(day, items.length)}
              className={cn(
                'box-border flex min-h-28 min-w-0 flex-col gap-[3px] border-r border-b border-subtle p-1.5 nth-[7n]:border-r-0',
                cellBackground(day),
              )}
            >
              <div className="flex h-6 items-center px-0.5">
                <DayNumber day={day} size={24} />
              </div>
              <ul className="m-0 flex list-none flex-col gap-[3px] p-0">
                {shown.map((p) => (
                  <Chip key={p.key} placed={p} variant="month" />
                ))}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenWeek(day.date);
                  }}
                  className="h-[22px] flex-none self-start rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] font-semibold text-2 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]"
                >
                  {t('calendar.more', { count: more })}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
