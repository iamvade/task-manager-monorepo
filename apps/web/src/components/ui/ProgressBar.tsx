import { cn } from '../../lib/cn';

interface ProgressBarProps {
  done: number;
  total: number;
  /** Track width: 32 (board card) or up to 160 (drawer, flexes). */
  width?: 32 | 160;
  className?: string;
}

/** 4px bar on #EFEFF2: accent, green once complete (Board / TaskDetail subtasks). */
export function ProgressBar({ done, total, width = 160, className }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-1 overflow-hidden rounded-[2px] bg-[var(--border-subtle)]',
        width === 160 ? 'max-w-[160px] flex-1' : 'w-8 flex-none',
        className,
      )}
    >
      <span
        className={cn(
          'h-1 rounded-[2px] transition-[width]',
          total > 0 && done === total ? 'bg-success' : 'bg-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
