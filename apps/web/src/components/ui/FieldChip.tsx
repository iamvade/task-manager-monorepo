import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FieldChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Avatar, icon or dot before the label. */
  leading?: ReactNode;
  label: ReactNode;
  /** Single-key hint (A / D / P). */
  kbd?: string;
  /** Its picker is open: accent-soft fill + accent border. */
  active?: boolean;
  /** Empty value ("Due date"): muted text. */
  muted?: boolean;
}

/**
 * Quick-create field chip (CreateTask.dc.html): 30px, 1px border, radius 8, 13/500, with a
 * 10px kbd (radius 3). Opens a picker (`aria-haspopup="listbox"`).
 */
export const FieldChip = forwardRef<HTMLButtonElement, FieldChipProps>(function FieldChip(
  { leading, label, kbd, active = false, muted = false, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-haspopup="listbox"
      aria-expanded={active}
      className={cn(
        'box-border flex h-[30px] max-w-[240px] items-center gap-1.5 rounded-[8px] border px-2 text-[13px] font-medium',
        active
          ? 'border-accent bg-accent-soft text-default'
          : 'border-control bg-control text-2 hover:bg-hover',
        muted && !active && 'text-muted',
        className,
      )}
      {...props}
    >
      {leading}
      <span className="truncate">{label}</span>
      {kbd && (
        <kbd className="rounded-[3px] border border-control px-1 font-sans text-[10px] leading-[14px] font-normal text-muted">
          {kbd}
        </kbd>
      )}
    </button>
  );
});
