import { useTranslation } from 'react-i18next';

const BAR = 8;
const GAP = 4;
const HEIGHT = 32;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface WeekBarsProps {
  /** Completions per day, Mon–Sun. */
  values: readonly number[];
  /** Today's index, Mon = 0. */
  todayIndex: number;
}

/**
 * Completions per day this week (MyTasks.dc.html): 8px bars, `max(4, n·8)` tall in 32px, scaled
 * down when a day would overflow. Past days accent at 40%, today accent, future days grey.
 */
export function WeekBars({ values, todayIndex }: WeekBarsProps) {
  const { t } = useTranslation();
  const max = Math.max(0, ...values);
  const unit = max * BAR > HEIGHT ? HEIGHT / max : BAR;
  const label = t('myTasks.stats.perDayLabel', {
    list: values
      .slice(0, todayIndex + 1)
      .map((count, i) =>
        t('myTasks.stats.perDayItem', {
          day: t(`calendar.weekdays.short.${WEEKDAYS[i] ?? 'mon'}`),
          count,
        }),
      )
      .join(', '),
  });

  return (
    <svg
      role="img"
      aria-label={label}
      width={values.length * BAR + (values.length - 1) * GAP}
      height={HEIGHT}
      className="flex-none"
    >
      {values.map((n, i) => {
        const h = Math.max(4, n * unit);
        return (
          <rect
            key={WEEKDAYS[i]}
            x={i * (BAR + GAP)}
            y={HEIGHT - h}
            width={BAR}
            height={h}
            rx={2}
            fill={i > todayIndex ? 'var(--border)' : 'var(--accent-ink)'}
            fillOpacity={i < todayIndex ? 0.4 : 1}
          />
        );
      })}
    </svg>
  );
}
