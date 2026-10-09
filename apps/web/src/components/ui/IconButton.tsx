import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Size = 20 | 24 | 28 | 32 | 36;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name (also the hover title unless `title` is given). */
  label: string;
  icon: ReactNode;
  size?: Size;
  /** Override the radius (designs: 6 for ≤ 28px, 8 above; the filter-chip × is round). */
  radius?: number;
}

/** Transparent square icon button with the ghost hover (`--hover`). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 28, radius, type = 'button', className, style, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'flex flex-none items-center justify-center border-0 bg-transparent p-0 text-3 enabled:hover:bg-hover disabled:opacity-50',
        className,
      )}
      style={{ width: size, height: size, borderRadius: radius ?? (size <= 28 ? 6 : 8), ...style }}
      {...props}
    >
      {icon}
    </button>
  );
});
