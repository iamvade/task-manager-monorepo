import type { StatusCategory } from '@kite/shared';
import type { CSSProperties } from 'react';

/**
 * Status marker by category (CLAUDE.md "Status markers"): 2px ring; To Do = grey ring,
 * In Progress = amber ring + left-half fill, In Review = accent(-ink) ring + accent 20% fill,
 * Done = solid green. Theme colors come from tokens.
 */
const STYLES: Record<StatusCategory, CSSProperties> = {
  todo: { borderColor: 'var(--status-todo)' },
  in_progress: {
    borderColor: 'var(--status-progress)',
    background: 'linear-gradient(90deg, var(--status-progress) 50%, transparent 50%)',
  },
  // Light: accent + 33 fill; dark: accent-soft, which is also accent + 33.
  review: { borderColor: 'var(--status-review)', background: 'var(--accent-soft-dark)' },
  done: { borderColor: 'var(--status-done)', background: 'var(--status-done)' },
};

interface StatusDotProps {
  category: StatusCategory;
  size?: 8 | 12;
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
      style={{ width: size, height: size, borderWidth: size === 12 ? 2 : 1.5, ...STYLES[category] }}
    />
  );
}
