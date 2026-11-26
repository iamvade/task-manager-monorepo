import type { Priority } from '@kite/shared';
import { useTranslation } from 'react-i18next';

/** Filled bars per level; the rest are drawn faded. */
const BARS: Partial<Record<Priority, number>> = { high: 3, medium: 2, low: 1 };

interface PriorityFlagProps {
  priority: Priority;
  size?: 12 | 14 | 16;
  /** Show the translated priority name after the icon (List cell: 13px, --text-2). */
  showLabel?: boolean;
  /** Accessible name of the bare icon; defaults to the priority name. `''` = decorative. */
  label?: string;
}

function Shape({ priority }: { priority: Priority }) {
  if (priority === 'none') {
    return (
      <g fill="currentColor" opacity={0.7}>
        <rect x="1.5" y="7.25" width="3" height="1.5" rx="0.5" />
        <rect x="6.5" y="7.25" width="3" height="1.5" rx="0.5" />
        <rect x="11.5" y="7.25" width="3" height="1.5" rx="0.5" />
      </g>
    );
  }
  if (priority === 'urgent') {
    return (
      <>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--prio-urgent)" />
        <rect x="7.1" y="3.75" width="1.8" height="5.5" rx="0.9" fill="var(--surface)" />
        <rect x="7.1" y="10.6" width="1.8" height="1.8" rx="0.9" fill="var(--surface)" />
      </>
    );
  }
  const filled = BARS[priority] ?? 0;
  return (
    <g fill="currentColor">
      <rect x="1.5" y="9" width="3" height="5.5" rx="1" opacity={filled >= 1 ? 1 : 0.35} />
      <rect x="6.5" y="5.5" width="3" height="9" rx="1" opacity={filled >= 2 ? 1 : 0.35} />
      <rect x="11.5" y="2" width="3" height="12.5" rx="1" opacity={filled >= 3 ? 1 : 0.35} />
    </g>
  );
}

/**
 * Priority icon (Linear-style, user decision 2026-11-27; the designs draw a flag):
 * "---" for none, a red "!" tile for urgent, three rising bars (3/2/1 filled) for high/medium/low.
 */
export function PriorityFlag({ priority, size = 14, showLabel, label }: PriorityFlagProps) {
  const { t } = useTranslation();
  const decorative = showLabel === true || label === '';
  const icon = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (label ?? t(`priority.${priority}`))}
      aria-hidden={decorative ? true : undefined}
      className={priority === 'none' ? 'text-muted' : 'text-2'}
      style={{ flex: 'none' }}
    >
      <Shape priority={priority} />
    </svg>
  );
  if (!showLabel) return icon;
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-[13px] ${priority === 'none' ? 'text-muted' : 'text-2'}`}
    >
      {icon}
      <span className="truncate">{t(`priority.${priority}`)}</span>
    </span>
  );
}
