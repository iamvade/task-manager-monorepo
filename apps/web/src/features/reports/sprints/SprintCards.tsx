import type { SprintDetail } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { percent } from './sprintMath';

/** One Sprints card: 10px swatch + 13px label, 26/32 value, 12px muted line (padding 14 16). */
function SprintCard({
  swatch,
  label,
  value,
  sub,
  warm,
}: {
  swatch: string;
  label: string;
  value: ReactNode;
  sub: string;
  /** The current sprint's "Carried over" card (#FFFBF5 / #F5DDB8 / #92400E). */
  warm?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-[12px] border px-4 py-3.5',
        warm ? 'border-warm-card bg-warm-card' : 'border-default bg-panel',
      )}
    >
      <span className="flex items-center gap-2 text-[13px] text-3">
        <span
          aria-hidden="true"
          className="size-2.5 flex-none rounded-[3px]"
          style={{ background: swatch }}
        />
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] leading-8 font-semibold tabular-nums',
          warm ? 'text-warm-card' : 'text-default',
        )}
      >
        {value}
      </span>
      <span className="text-[12px] text-muted">{sub}</span>
    </div>
  );
}

/** Committed · Completed · Added mid-sprint · Carried over / Carried to next sprint. */
export function SprintCards({ sprint }: { sprint: SprintDetail }) {
  const { t } = useTranslation();
  const k = 'reports.sprints.cards';
  const current = sprint.state === 'current';
  const scope = sprint.committed + sprint.added;
  const donePct = percent(sprint.completed, scope);
  const prev = sprint.previousSprint;
  const next = sprint.nextSprint;

  const completedSub =
    sprint.state === 'past'
      ? t(`${k}.ofTotalScope`, { pct: donePct })
      : current && sprint.pace
        ? t(`${k}.ofScopePace`, {
            pct: donePct,
            pace: t(`reports.sprints.pace.${sprint.pace}`),
          })
        : t(`${k}.ofScope`, { pct: donePct });

  const carriedCard =
    sprint.state === 'past' ? (
      <SprintCard
        swatch="var(--sprint-carried)"
        label={t(`${k}.carriedOut`)}
        value={sprint.carriedOut ?? 0}
        sub={next ? t(`${k}.carriedInto`, { number: next.number }) : t(`${k}.carriedIntoNone`)}
      />
    ) : (
      <SprintCard
        swatch="var(--sprint-carried)"
        label={t(`${k}.carried`)}
        value={sprint.carriedIn}
        warm={current && sprint.carriedIn > 0}
        sub={
          !prev
            ? t(`${k}.carriedNone`)
            : sprint.carriedInRepeated > 0
              ? t(`${k}.carriedFromRepeated`, {
                  number: prev.number,
                  count: sprint.carriedInRepeated,
                })
              : t(`${k}.carriedFrom`, { number: prev.number })
        }
      />
    );

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <SprintCard
        swatch="var(--sprint-committed)"
        label={t(`${k}.committed`)}
        value={sprint.committed}
        sub={
          current && sprint.carriedIn > 0
            ? t(`${k}.committedCarried`, { count: sprint.carriedIn })
            : t(`${k}.committedStart`)
        }
      />
      <SprintCard
        swatch="var(--sprint-completed)"
        label={t(`${k}.completed`)}
        value={sprint.completed}
        sub={completedSub}
      />
      <SprintCard
        swatch="var(--sprint-added)"
        label={t(`${k}.added`)}
        value={`+${String(sprint.added)}`}
        sub={t(`${k}.addedScope`, { pct: percent(sprint.added, sprint.committed) })}
      />
      {carriedCard}
    </div>
  );
}
