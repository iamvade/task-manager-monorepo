import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { CountBadge } from './CountBadge';

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Accent-soft count badge (active filters). Hidden at 0. */
  count?: number;
  countLabel?: string;
  /** No visible text: 32px square; pass `aria-label` (also used as the hover title). */
  iconOnly?: boolean;
}

/** 32px outlined toolbar button (Filter / Sort / View settings), 13px --text-2, 14px icon. */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { icon, count, countLabel, iconOnly = false, type = 'button', className, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        title={iconOnly ? props['aria-label'] : undefined}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-[8px] border border-control bg-control text-[13px] whitespace-nowrap text-2 enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50',
          iconOnly ? 'min-w-8 justify-center px-2' : 'px-2.5',
          className,
        )}
        {...props}
      >
        {icon}
        {children}
        {count ? <CountBadge value={count} tone="accentSoft" label={countLabel} /> : null}
      </button>
    );
  },
);
