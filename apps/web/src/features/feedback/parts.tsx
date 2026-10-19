import type { FeedbackStatus, FeedbackType } from '@kite/shared';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { typeColors } from './format';

/** Icon paths of the four types (Feedback.dc.html `TYPES`). */
const TYPE_ICON: Record<FeedbackType, string> = {
  bug: 'M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 1 1 6 0v1.1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6 13H2M22 13h-4',
  feature: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  feedback: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  other: 'M12 12h.01M19 12h.01M5 12h.01',
};

export function TypeIcon({ type, size = 12 }: { type: FeedbackType; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      <path d={TYPE_ICON[type]} />
    </svg>
  );
}

/**
 * Type badge: 22px r6 12/600 tinted per type, with its icon (inbox, detail); `compact` is the
 * 20px r5 11/600 badge without icon (pickers, task drawer).
 */
export function TypeBadge({
  type,
  compact = false,
  short = false,
}: {
  type: FeedbackType;
  compact?: boolean;
  /** "Feature" instead of "Feature request" (task drawer). */
  short?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span
      style={typeColors(type)}
      className={cn(
        'inline-flex flex-none items-center font-semibold whitespace-nowrap',
        compact
          ? 'h-5 rounded-[5px] px-1.5 text-[11px]'
          : 'h-[22px] gap-[5px] rounded-[6px] px-2 text-[12px]',
      )}
    >
      {!compact && <TypeIcon type={type} />}
      {t(short ? `feedback.typeShort.${type}` : `feedback.type.${type}`)}
    </span>
  );
}

/** The 8px square dot of a type (tabs). */
export function TypeDot({ type }: { type: FeedbackType }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 flex-none rounded-[2px]"
      style={{ background: `var(--fb-${type}-dot)` }}
    />
  );
}

const STATUS_STYLE: Record<FeedbackStatus, CSSProperties> = {
  new: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  review: {
    borderColor: 'var(--fb-status-review)',
    background: 'linear-gradient(90deg, var(--fb-status-review) 50%, transparent 50%)',
  },
  linked: {
    borderColor: 'var(--fb-status-linked)',
    background: 'color-mix(in srgb, var(--fb-status-linked) 20%, transparent)',
  },
  closed: { background: 'var(--fb-status-closed)', borderColor: 'var(--fb-status-closed)' },
};

/** Feedback status marker (10px; 8px in chips): New solid accent, In review half amber, … */
export function FeedbackStatusDot({
  status,
  size = 10,
}: {
  status: FeedbackStatus;
  size?: 8 | 10;
}) {
  return (
    <span
      aria-hidden="true"
      className="box-border inline-block flex-none rounded-full border-solid"
      style={{ width: size, height: size, borderWidth: 2, ...STATUS_STYLE[status] }}
    />
  );
}
