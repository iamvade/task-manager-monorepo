import type { StatusCategory } from '@kite/shared';
import type { CSSProperties } from 'react';

/** A centered stroke at `angle`, for the pause bars and the cross (no SVG: the dot is a span). */
const bar = (angle: string, color: string, from: number, to: number) =>
  `linear-gradient(${angle}, transparent ${from}%, ${color} ${from}%, ${color} ${to}%, transparent ${to}%)`;

/**
 * Status marker by category (CLAUDE.md "Status markers"): 2px ring; To Do = grey ring,
 * In Progress = amber ring + left-half fill, In Review = accent(-ink) ring + accent 20% fill,
 * Done = solid green. Theme colors come from tokens. Not in the designs (derived): On hold = rose
 * ring with two pause bars, Cancelled = solid grey with a cross.
 */
const STYLES: Record<StatusCategory, CSSProperties> = {
  todo: { borderColor: 'var(--status-todo)' },
  in_progress: {
    borderColor: 'var(--status-progress)',
    background: 'linear-gradient(90deg, var(--status-progress) 50%, transparent 50%)',
  },
  // Light: accent + 33 fill; dark: accent-soft, which is also accent + 33.
  review: { borderColor: 'var(--status-review)', background: 'var(--accent-soft-dark)' },
  on_hold: {
    borderColor: 'var(--status-hold)',
    background: `${bar('90deg', 'var(--status-hold)', 22, 40)}, ${bar('90deg', 'var(--status-hold)', 60, 78)}`,
  },
  done: { borderColor: 'var(--status-done)', background: 'var(--status-done)' },
  cancelled: {
    borderColor: 'var(--status-cancelled)',
    background: `${bar('45deg', 'var(--bg)', 40, 60)}, ${bar('-45deg', 'var(--bg)', 40, 60)}, var(--status-cancelled)`,
  },
};

interface StatusDotProps {
  category: StatusCategory;
  size?: 8 | 10 | 12 | 16;
  /** Accessible name; omit when the status name is shown next to it. */
  label?: string;
}

export function StatusDot({ category, size = 12, label }: StatusDotProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="box-border inline-block flex-none rounded-full border-solid"
      style={{ width: size, height: size, borderWidth: size === 8 ? 1.5 : 2, ...STYLES[category] }}
    />
  );
}
