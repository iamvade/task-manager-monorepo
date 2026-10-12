import { weekdayIndex, type Home } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { ClockIcon, MyTasksIcon, WarningIcon } from '../../components/icons';
import { StatCard } from '../../components/ui/StatCard';
import { WeekBars } from './WeekBars';

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
