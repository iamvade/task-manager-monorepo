import type { ReactNode } from 'react';

export interface CategoryBar {
  key: string;
  label: string;
  /** Leading marker (a status dot). */
  marker?: ReactNode;
  /** null = no data: an empty track. */
  value: number | null;
  valueLabel: string;
  /** CSS color of the bar. */
  color: string;
}

interface BarByCategoryProps {
  items: readonly CategoryBar[];
  /** Value of a full track; defaults to max(5, the largest value rounded up). */
  max?: number;
  label: string;
}

/**
 * Horizontal bars per category (Reports.dc.html "Where work waits"): label row (marker, 13px
 * label, 600 value) over a 12px bar on a `--wait-track` track, radius 4, rows 16px apart.
 */
export function BarByCategory({ items, max, label }: BarByCategoryProps) {
  const full = max ?? Math.max(5, Math.ceil(Math.max(0, ...items.map((i) => i.value ?? 0))));
  return (
    <div role="list" aria-label={label} className="flex flex-col gap-4 pt-2">
      {items.map((item) => (
        <div
          key={item.key}
          role="listitem"
          title={`${item.label}: ${item.valueLabel}`}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2 text-[13px]">
            {item.marker}
            <span className="flex-1 text-2">{item.label}</span>
            <strong className="font-semibold text-default tabular-nums">{item.valueLabel}</strong>
          </div>
          <div aria-hidden="true" className="flex h-3 rounded-[4px] bg-wait-track">
            <span
              className="h-3 rounded-[4px]"
              style={{
                width: `${((Math.min(item.value ?? 0, full) / full) * 100).toFixed(1)}%`,
                background: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
