import { useState, type ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { ChartFrame, type ChartTable } from './ChartFrame';
import { ChartTooltip, HoverColumns } from './ChartTooltip';
import { niceTicks } from './scale';
import { SPRINT_COLORS } from './sprintColors';

export interface SprintBarGroup {
  key: string;
  /** "S14" under the group. */
  short: string;
  /** "83%" / "in progress" under the name. */
  rate: string;
  committed: number;
  added: number;
  completed: number;
  /** The running sprint: its completed bar is hatched. */
  current: boolean;
  selected: boolean;
  /** Tooltip content. */
  tooltip: ReactNode;
}

interface SprintBarsProps {
  groups: readonly SprintBarGroup[];
  ariaLabel: string;
  /** The values as a visually hidden table. */
  table?: ChartTable;
  height?: number;
}

const { committed: COMMITTED, completed: COMPLETED, added: ADDED } = SPRINT_COLORS;
const HATCH = `repeating-linear-gradient(135deg, ${COMPLETED} 0 3px, color-mix(in srgb, ${COMPLETED} 60%, transparent) 3px 6px)`;

/**
 * Committed vs completed per sprint (ReportsSprints.dc.html): per group an 18px column stacking
 * committed (bottom) and added mid-sprint (top, 2px apart) next to an 18px completed bar; the
 * selected sprint's group is tinted accent-soft, the hovered one bg-subtle; 28px gutter.
 */
export function SprintBars({ groups, ariaLabel, table, height = 200 }: SprintBarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(
    Math.max(1, ...groups.map((g) => Math.max(g.committed + g.added, g.completed))),
    5,
  );
  const top = ticks[ticks.length - 1] ?? 1;
  const px = (v: number) => (v / top) * height;
  const hovered = hover === null ? undefined : groups[hover];

  return (
    <ChartFrame
      ticks={ticks}
      ariaLabel={ariaLabel}
      table={table}
      height={height}
      gutter={28}
      xLabels={groups.map((g) => (
        <span key={g.key} className="flex flex-col leading-[15px]">
          <span className={cn(g.selected && 'font-semibold text-default')}>{g.short}</span>
          <span>{g.rate}</span>
        </span>
      ))}
    >
      <div aria-hidden="true" className="absolute inset-0 flex">
        {groups.map((g, i) => (
          <div
            key={g.key}
            className={cn(
              'relative flex h-full flex-1 items-end justify-center gap-1 rounded-t-[6px]',
              g.selected ? 'bg-accent-soft' : hover === i && 'bg-subtle',
            )}
          >
            <div className="flex w-[18px] flex-col gap-0.5">
              {g.added > 0 && (
                <span
                  className="block w-[18px] rounded-[4px_4px_1px_1px]"
                  style={{ height: px(g.added), background: ADDED }}
                />
              )}
              <span
                className={cn(
                  'block w-[18px]',
                  g.added > 0 ? 'rounded-[1px_1px_0_0]' : 'rounded-[4px_4px_0_0]',
                )}
                style={{ height: px(g.committed), background: COMMITTED }}
              />
            </div>
            <span
              className="block w-[18px] rounded-[4px_4px_0_0]"
              style={{ height: px(g.completed), background: g.current ? HATCH : COMPLETED }}
            />
          </div>
        ))}
      </div>
      <HoverColumns count={groups.length} onHover={setHover} />
      {hover !== null && hovered && (
        <ChartTooltip index={hover} count={groups.length}>
          {hovered.tooltip}
        </ChartTooltip>
      )}
    </ChartFrame>
  );
}

/** Tooltip row with a square swatch (the sprint chart's legend style). */
export function SwatchRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-2">
      <span className="size-2 flex-none rounded-[2px]" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <strong className="font-semibold">{value}</strong>
    </span>
  );
}
