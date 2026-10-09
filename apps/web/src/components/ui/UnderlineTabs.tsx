import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';

export interface UnderlineTab {
  value: string;
  label: string;
  icon?: ReactNode;
  to: string;
}

interface UnderlineTabsProps {
  items: readonly UnderlineTab[];
  value: string;
  /** Accessible name of the tab list. */
  label: string;
}

/**
 * Route tabs (view switcher): 40px, 13/500, selected = --text with a 2px accent(-ink) inset
 * underline, others muted. Each tab is a link so the view lives in the URL.
 */
export function UnderlineTabs({ items, value, label }: UnderlineTabsProps) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <NavLink
            key={item.value}
            to={item.to}
            role="tab"
            aria-selected={selected}
            className={cn(
              'flex h-10 items-center gap-1.5 px-2.5 text-[13px] font-medium',
              selected
                ? 'text-default shadow-[inset_0_-2px_0_var(--accent-ink)]'
                : 'text-muted hover:text-default',
            )}
          >
            {item.icon}
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}
