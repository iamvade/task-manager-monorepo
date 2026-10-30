import { useState } from 'react';
import { ChartFrame, type ChartTable } from './ChartFrame';
import { ChartTooltip, HoverColumns, HoverLine, TooltipRow } from './ChartTooltip';
import { columnCenter, linePath, niceTicks } from './scale';

export interface TrendPoint {
  /** X axis label ("Jul 20"). */
  label: string;
  /** Tooltip heading ("Week of Oct 5"). */
  title: string;
  value: number;
  /** Same position in the previous series. */
  prev?: number | null;
  /** Still in progress: hollow point + `partialNote` in the tooltip. */
  partial?: boolean;
}

interface LineTrendProps {
  points: readonly TrendPoint[];
  seriesLabel: string;
  prevLabel?: string;
  /** Tooltip note on a partial point ("This week is still in progress"). */
  partialNote?: string;
  /** Accessible summary of the figure. */
  ariaLabel: string;
  /** The values as a visually hidden table. */
  table?: ChartTable;
  height?: number;
  /** Series names at the right end of the lines (Throughput). */
  endLabels?: boolean;
  formatValue?: (value: number) => string;
  /** Columns tinted accent-soft behind the lines (the weeks of the selected period). */
  band?: { from: number; to: number } | null;
  /** Dash the previous line (4 4) so it doesn't rely on its light grey alone. */
  prevDashed?: boolean;
}

const END_MARGIN = 72;
const MAIN = 'var(--accent-ink)';
const PREV = 'var(--chart-prev)';

/**
 * Line chart with an optional previous-period line (Reports.dc.html Throughput): one SVG for the
 * strokes (2px, round, non-scaling), 8px points as spans with a 2px panel ring, the partial
 * point hollow; hover shows a vertical line, scales the point 1.35 and opens the tooltip.
 */
export function LineTrend({
  points,
  seriesLabel,
  prevLabel,
  partialNote,
  ariaLabel,
  table,
  height = 200,
  endLabels = true,
  formatValue = String,
  band = null,
  prevDashed = false,
}: LineTrendProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const prevValues = points.map((p) => p.prev ?? null);
  const hasPrev = prevLabel !== undefined && prevValues.some((v) => v !== null);
  const ticks = niceTicks(
    Math.max(0, ...points.map((p) => p.value), ...prevValues.map((v) => v ?? 0)),
  );
  const top = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => height - (v / top) * height;

  const mainPath = linePath(points.map((p, i) => ({ x: columnCenter(i, n), y: y(p.value) })));
  const prevPath = hasPrev
    ? linePath(
        prevValues.flatMap((v, i) => (v === null ? [] : [{ x: columnCenter(i, n), y: y(v) }])),
      )
    : '';

  const last = points[n - 1];
  const lastPrev = prevValues[n - 1] ?? null;
  const mainEndY = last ? y(last.value) : 0;
  // The design sets the previous label 14px above its line end; move it below the main label
  // when the two would overlap.
  let prevEndY = lastPrev === null ? null : y(lastPrev) - 14;
  if (prevEndY !== null && Math.abs(prevEndY - mainEndY) < 14) prevEndY = mainEndY + 14;

  const hovered = hover === null ? undefined : points[hover];

  return (
    <ChartFrame
      ticks={ticks}
      xLabels={points.map((p) => p.label)}
      ariaLabel={ariaLabel}
      table={table}
      height={height}
      endMargin={endLabels ? END_MARGIN : 0}
    >
      {band && (
        <span
          aria-hidden="true"
          data-band=""
          className="absolute inset-y-0 rounded-[4px] bg-accent-soft"
          style={{
            left: `${((band.from / n) * 100).toFixed(2)}%`,
            width: `${(((band.to - band.from + 1) / n) * 100).toFixed(2)}%`,
          }}
        />
      )}
      <svg
        aria-hidden="true"
        width="100%"
        height={height}
        viewBox={`0 0 1000 ${String(height)}`}
        preserveAspectRatio="none"
        className="absolute inset-0 overflow-visible"
      >
        {hasPrev && (
          <path
            d={prevPath}
            fill="none"
            stroke={PREV}
            strokeWidth={2}
            strokeDasharray={prevDashed ? '4 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={mainPath}
          fill="none"
          stroke={MAIN}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {hover !== null && <HoverLine index={hover} count={n} />}
      {points.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-partial={p.partial ? true : undefined}
          className="absolute -mt-1 -ml-1 box-border size-2 rounded-full shadow-[0_0_0_2px_var(--chart-point-ring)] transition-transform"
          style={{
            left: `${(columnCenter(i, n) * 100).toFixed(2)}%`,
            top: y(p.value),
            ...(p.partial
              ? { background: 'var(--chart-point-ring)', border: `2px solid ${MAIN}` }
              : { background: MAIN }),
            transform: hover === i ? 'scale(1.35)' : undefined,
          }}
        />
      ))}
      {endLabels && last && (
        <span
          aria-hidden="true"
          className="absolute left-[calc(100%+8px)] -translate-y-1/2 text-[12px] leading-4 font-semibold whitespace-nowrap text-default"
          style={{ top: mainEndY }}
        >
          {seriesLabel}
        </span>
      )}
      {endLabels && hasPrev && prevEndY !== null && (
        <span
          aria-hidden="true"
          className="absolute left-[calc(100%+8px)] -translate-y-1/2 text-[12px] leading-4 whitespace-nowrap text-muted"
          style={{ top: prevEndY }}
        >
          {prevLabel}
        </span>
      )}
      <HoverColumns
        count={n}
        active={hover}
        name={table?.caption ?? ariaLabel}
        onHover={setHover}
      />
      {hover !== null && hovered && (
        <ChartTooltip index={hover} count={n}>
          <span className="font-semibold text-default">{hovered.title}</span>
          <TooltipRow color={MAIN} label={seriesLabel} value={formatValue(hovered.value)} strong />
          {hasPrev && prevLabel && (
            <TooltipRow
              color={PREV}
              label={prevLabel}
              value={
                hovered.prev === null || hovered.prev === undefined
                  ? '—'
                  : formatValue(hovered.prev)
              }
            />
          )}
          {hovered.partial && partialNote && <span className="text-muted">{partialNote}</span>}
        </ChartTooltip>
      )}
    </ChartFrame>
  );
}
