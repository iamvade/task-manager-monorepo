import { weekdayIndex, type Home } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ClockIcon, MyTasksIcon, WarningIcon } from '../../components/icons';
import { cn } from '../../lib/cn';
import { WeekBars } from './WeekBars';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  sub: ReactNode;
  tone?: 'default' | 'danger';
  /** Right of the number (the week bars). */
  aside?: ReactNode;
}

/** 12px-radius card: icon + 13px label, 28/32 number with a 12px note (MyTasks.dc.html). */
function StatCard({ icon, label, value, sub, tone = 'default', aside }: StatCardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex flex-col gap-2 rounded-[12px] border p-4',
        tone === 'danger' ? 'border-danger-card bg-danger-card' : 'border-default',
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-3">
        {icon}
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              'text-[28px] leading-8 font-semibold',
              tone === 'danger' ? 'text-danger' : 'text-default',
            )}
          >
            {value}
          </span>
          <span className="min-w-0 text-[12px] text-muted">{sub}</span>
        </div>
        {aside}
      </div>
    </div>
  );
}

/** "+3" / "−1" / "0". */
const signed = (n: number) => (n > 0 ? `+${String(n)}` : n < 0 ? `−${String(-n)}` : '0');

/** Due today · Completed this week (+ week bars) · Overdue. */
export function StatCards({ home }: { home: Home }) {
  const { t } = useTranslation();
  const { dueToday, completedThisWeek, overdue } = home.stats;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <StatCard
        icon={<ClockIcon size={14} className="text-warning" />}
        label={t('myTasks.stats.dueToday')}
        value={dueToday.open}
        sub={[
          t('myTasks.stats.dueTodayLeft', { count: dueToday.total }),
          dueToday.urgent > 0 && t('myTasks.stats.urgent', { count: dueToday.urgent }),
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <StatCard
        icon={<MyTasksIcon size={14} strokeWidth={2.25} className="text-success" />}
        label={t('myTasks.stats.completedThisWeek')}
        value={completedThisWeek.count}
        sub={
          <span className={completedThisWeek.delta > 0 ? 'text-tint-done' : undefined}>
            {t('myTasks.stats.vsLastWeek', { delta: signed(completedThisWeek.delta) })}
          </span>
        }
        aside={<WeekBars values={completedThisWeek.perDay} todayIndex={weekdayIndex(home.today)} />}
      />
      <StatCard
        icon={<WarningIcon size={14} className="text-danger" />}
        label={t('myTasks.stats.overdue')}
        value={overdue.count}
        sub={
          overdue.oldestDaysLate !== null &&
          t('myTasks.stats.oldestLate', { count: overdue.oldestDaysLate })
        }
        tone={overdue.count > 0 ? 'danger' : 'default'}
      />
    </div>
  );
}
