import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface KbdProps {
  children: ReactNode;
  /** plain = outlined (sidebar ⌘K); onAccent = on a primary button. */
  variant?: 'plain' | 'onAccent';
  className?: string;
}

export function Kbd({ children, variant = 'plain', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'rounded-[4px] border px-1 font-sans text-[11px] leading-4',
        variant === 'plain'
          ? 'border-control text-muted'
          : 'border-transparent bg-white/20 text-white',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
