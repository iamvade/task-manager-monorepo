import type { PaletteKey } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { NextIcon, PrevIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { cn } from '../../lib/cn';
import { MONTHS } from '../../lib/useDates';
import type { CalendarMode } from '../../stores/ui';
import { periodTitle } from './calendarGrid';

export interface CalendarProject {
  id: string;
  name: string;
  color: PaletteKey;
}

interface CalendarToolbarProps {
  anchor: string;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  onToday: () => void;
  onStep: (step: -1 | 1) => void;
  /** Space calendar: one toggle chip per project. Empty on a project calendar. */
  projects: readonly CalendarProject[];
  hidden: readonly string[];
  onToggleProject: (projectId: string) => void;
}

/**
 * Today · ‹ › · "October 2026" (18/24) · Month/Week · project chips (dot + name; off = 50% +
 * strike-through, `aria-pressed`).
 */
export function CalendarToolbar({
  anchor,
  mode,
  onModeChange,
  onToday,
  onStep,
  projects,
  hidden,
  onToggleProject,
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  const title = periodTitle(anchor, mode);
  const month = (m: number | undefined, form: 'short' | 'long') =>
    t(`calendar.months.${form}.${MONTHS[(m ?? 1) - 1] ?? 'm1'}`);
  const heading = t(`calendar.period.${title.key}`, {
    ...title.vars,
    monthLong: month(title.vars.m, 'long'),
    monthShort: month(title.vars.m, 'short'),
    startMonthShort: month(title.vars.startM, 'short'),
    endMonthShort: month(title.vars.endM, 'short'),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onToday}>{t('calendar.today')}</Button>
      <div className="flex">
        <IconButton
          label={t(mode === 'month' ? 'calendar.previousMonth' : 'calendar.previousWeek')}
          size={32}
          icon={<PrevIcon size={16} />}
          onClick={() => {
            onStep(-1);
          }}
        />
        <IconButton
          label={t(mode === 'month' ? 'calendar.nextMonth' : 'calendar.nextWeek')}
          size={32}
          icon={<NextIcon size={16} />}
          onClick={() => {
            onStep(1);
          }}
        />
      </div>
      <h1 className="m-0 mr-2 text-[18px] leading-6 font-semibold">{heading}</h1>
      <SegmentedControl
        size="md"
        label={t('calendar.range')}
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'month', label: t('calendar.month') },
          { value: 'week', label: t('calendar.week') },
        ]}
      />
      <span className="flex-1" />
      {projects.length > 0 && (
        <div
          role="group"
          aria-label={t('calendar.showProjects')}
          className="flex flex-wrap items-center gap-1"
        >
          {projects.map((project) => {
            const on = !hidden.includes(project.id);
            return (
              <button
                key={project.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onToggleProject(project.id);
                }}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full border border-control bg-control px-2.5 text-[12px] font-medium text-default outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]',
                  !on && 'line-through opacity-50',
                )}
              >
                <ProjectDot color={project.color} size={8} />
                {project.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
