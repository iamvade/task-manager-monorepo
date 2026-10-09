import type { Priority } from '@kite/shared';
import { useTranslation } from 'react-i18next';

const COLOR: Record<Priority, string> = {
  urgent: 'var(--prio-urgent)',
  high: 'var(--prio-high)',
  medium: 'var(--prio-medium)',
  low: 'var(--prio-low)',
  none: 'var(--prio-none)',
};

interface PriorityFlagProps {
  priority: Priority;
  size?: 12 | 14;
  /** Show the translated priority name after the flag (List cell: 13px, --text-2). */
  showLabel?: boolean;
}

/** Flag icon: filled for urgent/high/medium, outline for low and none. */
export function PriorityFlag({ priority, size = 14, showLabel }: PriorityFlagProps) {
  const { t } = useTranslation();
  const color = COLOR[priority];
  const filled = priority === 'urgent' || priority === 'high' || priority === 'medium';
  const flag = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : t(`priority.${priority}`)}
      aria-hidden={showLabel ? true : undefined}
      style={{ flex: 'none', stroke: color, fill: filled ? color : 'none' }}
    >
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </svg>
  );
  if (!showLabel) return flag;
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-[13px] ${priority === 'none' ? 'text-muted' : 'text-2'}`}
    >
      {flag}
      <span className="truncate">{t(`priority.${priority}`)}</span>
    </span>
  );
}
