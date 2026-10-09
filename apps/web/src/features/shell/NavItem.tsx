import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  /** Trailing content: a count or a badge. */
  trailing?: ReactNode;
}

/**
 * 32px sidebar link (Main.dc.html): 16px icon, 500 label, --text-2; hover #EDEDF0.
 * Active (MyTasks.dc.html): accent-soft bg, accent text, 600 label.
 */
export function NavItem({ to, icon, label, trailing }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-8 items-center gap-2 rounded-[8px] px-3',
          isActive ? 'bg-accent-soft text-accent-ink' : 'text-2 hover:bg-nav-hover',
        )
      }
    >
      {({ isActive }) => (
        <>
          {icon}
          <span className={cn('flex-1 truncate', isActive ? 'font-semibold' : 'font-medium')}>
            {label}
          </span>
          {trailing}
        </>
      )}
    </NavLink>
  );
}
