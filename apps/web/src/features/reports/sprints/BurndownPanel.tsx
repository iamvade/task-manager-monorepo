import type { SprintDetail } from '@kite/shared';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { sprintLabel } from '../../../lib/sprint';
import { useDates } from '../../../lib/useDates';
import { Burndown, type BurndownPoint } from '../charts/Burndown';
import { InsightBox } from '../ui/InsightBox';
import { Panel, PanelHeading } from '../ui/Panel';
import { burndownLabelIndexes, projectedLine, todayIndexOf } from './sprintMath';

interface BurndownPanelProps {
  sprint: SprintDetail;
  /** Replan link target (current and future sprints). */
  replanHref: string | null;
}

/**
 * Sprint burndown (ReportsSprints.dc.html): remaining, ideal and projected lines with the today
 * marker and scope-added chips; a warning insight with a Replan link when the projection ends
 * above zero. Past sprints show the full remaining line only.
 */
export function BurndownPanel({ sprint, replanHref }: BurndownPanelProps) {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  const k = 'reports.sprints.burndown';
  const todayIndex = todayIndexOf(sprint);
  const name = sprintLabel(t, sprint);
  const dates = sprint.burndown.map((p) => p.date);
  const labelled = burndownLabelIndexes(dates);
  const todayRemaining =
    todayIndex === null ? null : (sprint.burndown[todayIndex]?.remaining ?? null);
  const projected =
    todayIndex !== null && todayRemaining !== null && sprint.projectedRemaining !== null
      ? projectedLine(dates.length, todayIndex, todayRemaining, sprint.projectedRemaining)
      : dates.map(() => null);

  const points: BurndownPoint[] = sprint.burndown.map((p, i) => ({
    label: labelled.has(i) ? formatDate(p.date) : '',
    title:
      i === 0
        ? t(`${k}.start`, { date: formatDate(p.date) })
        : i === todayIndex
          ? t(`${k}.todayTitle`, { date: formatDate(p.date) })
          : formatDate(p.date),
    remaining: p.remaining,
    ideal: p.ideal,
    projected: projected[i] ?? null,
    added: p.added,
  }));

  const committed = sprint.committed;
  const summary =
    sprint.state === 'future'
      ? t(`${k}.summaryFuture`, { committed })
      : sprint.state === 'past'
        ? t(`${k}.summaryPast`, {
            committed,
            remaining: sprint.burndown.at(-1)?.remaining ?? 0,
          })
        : [
            t(`${k}.summary`, {
              committed,
              day: sprint.workingDays.elapsed,
              remaining: todayRemaining ?? 0,
              ideal: Math.round(sprint.burndown[todayIndex ?? 0]?.ideal ?? 0),
            }),
            sprint.projectedRemaining !== null &&
              t(`${k}.summaryProjected`, { count: Math.round(sprint.projectedRemaining) }),
          ]
            .filter(Boolean)
            .join(' ');

  const left = sprint.projectedRemaining === null ? 0 : Math.round(sprint.projectedRemaining);
  const sampleChip = Math.max(2, ...sprint.burndown.map((p) => p.added));

  return (
    <Panel labelledBy="sprints-burndown" className="flex-[1_1_480px] gap-4 p-5">
      <div className="flex flex-col gap-2">
        <PanelHeading
          id="sprints-burndown"
          title={sprint.state === 'current' ? t(`${k}.title`) : t(`${k}.titleOther`, { name })}
          sub={t(`${k}.sub`, { name })}
        />
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-3">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-[1px] bg-[var(--accent-ink)]" />
            {t(`${k}.remaining`)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-[var(--chart-ideal)]" />
            {t(`${k}.ideal`)}
          </span>
          {sprint.state === 'current' && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dotted border-[var(--accent-ink)]" />
              {t(`${k}.projection`)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="flex h-4 items-center rounded-[4px] bg-warning-soft px-1 text-[10px] font-semibold text-warning-soft">
              +{sampleChip}
            </span>
            {t(`${k}.scopeAdded`)}
          </span>
        </div>
      </div>
      <Burndown
        points={points}
        todayIndex={todayIndex}
        ariaLabel={summary}
        labels={{
          remaining: t(`${k}.remaining`),
          ideal: t(`${k}.ideal`),
          projection: t(`${k}.projection`),
          today: t(`${k}.today`),
        }}
        projectedEndLabel={
          sprint.projectedRemaining === null ? undefined : t(`${k}.projectedEnd`, { count: left })
        }
        formatCount={(n) => t(`${k}.tasks`, { count: n })}
      />
      {sprint.state === 'current' && left > 0 && (
        <InsightBox tone="warning" className="mt-auto">
          {t(`${k}.insight`, { count: left })}{' '}
          {sprint.waitingMost
            ? t(`${k}.insightStatus`, { status: t(`${k}.status.${sprint.waitingMost}`) })
            : t(`${k}.insightNoStatus`)}
          {replanHref && (
            <>
              {' '}
              <Link
                to={replanHref}
                title={t('reports.sprints.replanTitle')}
                className="font-medium text-accent-ink hover:underline"
              >
                {t('reports.sprints.replan')}
              </Link>
            </>
          )}
        </InsightBox>
      )}
    </Panel>
  );
}
