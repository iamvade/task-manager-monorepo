import type { SprintDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { sprintLabel } from '../../../lib/sprint';
import { useDates } from '../../../lib/useDates';
import { SprintBars, SwatchRow } from '../charts/SprintBars';
import { SPRINT_COLORS } from '../charts/sprintColors';
import { Panel, PanelHeading } from '../ui/Panel';
import { percent } from './sprintMath';

/** 10px radius-3 swatch + label (chart legends). */
export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 flex-none rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/** "Committed vs completed · last 6 sprints" (ReportsSprints.dc.html). */
export function SprintBarsPanel({ sprint }: { sprint: SprintDetail }) {
  const { t } = useTranslation();
  const { formatRange } = useDates();
  const k = 'reports.sprints';
  const labels = {
    committed: t(`${k}.cards.committed`),
    added: t(`${k}.cards.added`),
    completed: t(`${k}.cards.completed`),
  };

  const groups = sprint.recent.map((r) => {
    const rate = r.current
      ? t(`${k}.chart.inProgress`)
      : percent(r.completed, r.committed + r.added);
    return {
      key: r.id,
      short: t(`${k}.short`, { number: r.number }),
      rate,
      committed: r.committed,
      added: r.added,
      completed: r.completed,
      current: r.current,
      selected: r.id === sprint.id,
      tooltip: (
        <>
          <span className="font-semibold text-default">
            {sprintLabel(t, r)}{' '}
            <span className="font-normal text-muted">{formatRange(r.startDate, r.endDate)}</span>
          </span>
          <SwatchRow
            color={SPRINT_COLORS.committed}
            label={labels.committed}
            value={String(r.committed)}
          />
          <SwatchRow
            color={SPRINT_COLORS.added}
            label={labels.added}
            value={`+${String(r.added)}`}
          />
          <SwatchRow
            color={SPRINT_COLORS.completed}
            label={labels.completed}
            value={String(r.completed)}
          />
          <span className="text-muted">
            {r.current
              ? t(`${k}.chart.inProgress`)
              : t(`${k}.chart.done`, { pct: percent(r.completed, r.committed + r.added) })}
          </span>
        </>
      ),
    };
  });

  const summary = sprint.recent
    .map((r) =>
      t(`${k}.chart.summaryItem`, {
        name: sprintLabel(t, r),
        committed: r.committed,
        added: r.added,
        completed: r.completed,
      }),
    )
    .join('; ');

  return (
    <Panel labelledBy="sprints-bars" className="flex-[1_1_480px] gap-4 p-5">
      <div className="flex flex-col gap-2">
        <PanelHeading id="sprints-bars" title={t(`${k}.chart.title`)} sub={t(`${k}.chart.sub`)} />
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-3">
          <Swatch color={SPRINT_COLORS.committed} label={labels.committed} />
          <Swatch color={SPRINT_COLORS.added} label={labels.added} />
          <Swatch color={SPRINT_COLORS.completed} label={labels.completed} />
        </div>
      </div>
      <SprintBars groups={groups} ariaLabel={summary} />
    </Panel>
  );
}
