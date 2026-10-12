import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
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
 * underline, others muted. Each tab is a link so the view lives in the URL. ARIA tabs keyboard:
 * only the selected tab is in the Tab order; ←/→ (wrapping), Home and End move to a tab and open it.
 */
export function UnderlineTabs({ items, value, label }: UnderlineTabsProps) {
  const navigate = useNavigate();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const item = next === null ? undefined : items[next];
    if (next === null || !item) return;
    event.preventDefault();
    refs.current[next]?.focus();
    void navigate(item.to);
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto">
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <NavLink
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            to={item.to}
            role="tab"
            aria-selected={selected}
            tabIndex={index === selectedIndex ? 0 : -1}
            onKeyDown={(e) => {
              onKeyDown(e, index);
            }}
            className={cn(
              'flex h-10 flex-none items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap focus-visible:-outline-offset-2',
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
