import type { ReactNode } from 'react';
import { InfoIcon, WarningIcon } from '../../../components/icons';
import { cn } from '../../../lib/cn';

const TONES = {
  accent: 'bg-accent-soft',
  warning: 'bg-warning-soft',
  neutral: 'border border-subtle bg-sidebar',
} as const;

/**
 * Tinted note under a chart (Reports.dc.html "Where work waits"): radius 8, padding 10 12,
 * 13/20 `--text-2` with a 14px info icon on accent-soft, or a warning icon on warning-soft
 * (burndown). People / My performance notes pass a 16px speech-bubble `icon`; People's is
 * neutral (sidebar bg, subtle border).
 */
export function InsightBox({
  tone = 'accent',
  icon,
  children,
  className,
}: {
  tone?: 'accent' | 'warning' | 'neutral';
  /** Replaces the tone's default icon (sized and colored by the caller). */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'm-0 flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-[13px] leading-5 text-2',
        TONES[tone],
        className,
      )}
    >
      {icon ??
        (tone === 'warning' ? (
          <WarningIcon size={14} className="mt-[3px] flex-none text-warning-icon" />
        ) : (
          <InfoIcon size={14} className="mt-[3px] flex-none text-accent-ink" />
        ))}
      <span>{children}</span>
    </p>
  );
}
