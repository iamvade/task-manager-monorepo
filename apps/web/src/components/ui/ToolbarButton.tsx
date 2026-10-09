import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { CountBadge } from './CountBadge';

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Accent-soft count badge (active filters). Hidden at 0. */
  count?: number;
  countLabel?: string;
}

/** 32px outlined toolbar button (Filter / Sort / Group), 13px --text-2, 14px icon. */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { icon, count, countLabel, type = 'button', className, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-[8px] border border-control bg-control px-2.5 text-[13px] whitespace-nowrap text-2 enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50',
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
