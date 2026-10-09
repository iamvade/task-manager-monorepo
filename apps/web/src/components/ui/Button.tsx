import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { buttonVariants, type ButtonVariant as Variant } from './buttonStyles';
import { Kbd } from './Kbd';

type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** sm 28px · md 32px (toolbar, Share) · lg 40px (CTAs). */
  size?: Size;
  /** Leading icon (14px). */
  icon?: ReactNode;
  /** Trailing keyboard hint, e.g. "C". */
  kbd?: string;
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';

const sizes: Record<Size, string> = { sm: 'h-7 px-2.5', md: 'h-8 px-3', lg: 'h-10 px-4' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', type = 'button', icon, kbd, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, buttonVariants[variant], sizes[size], className)}
      {...props}
    >
      {icon}
      {children}
      {kbd && <Kbd variant={variant === 'primary' ? 'onAccent' : 'plain'}>{kbd}</Kbd>}
    </button>
  );
});
