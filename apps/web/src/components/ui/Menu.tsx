import { Check } from 'lucide-react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Popover, type TriggerProps } from './Popover';

export type MenuItem =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      /** Shows the accent ✓ (single-choice menus like Sort / Group). */
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: 'separator'; id: string }
  | { type: 'heading'; id: string; label: string };

interface MenuProps {
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  items: readonly MenuItem[];
  /** Accessible name of the menu. */
  label: string;
  placement?: 'bottom-start' | 'bottom-end';
  width?: number;
}

/** Popover menu: 32px options, radius 6, ↑↓ / Home / End move focus, Enter selects. */
export function Menu({
  trigger,
  items,
  label,
  placement = 'bottom-start',
  width = 220,
}: MenuProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'),
    );
    const index = options.findIndex((el) => el === document.activeElement);
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % options.length,
      ArrowUp: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    options[next]?.focus();
  }

  return (
    <Popover trigger={trigger} role="menu" label={label} placement={placement} width={width}>
      {(close) => (
        <div className="flex flex-col" onKeyDown={onKeyDown}>
          {items.map((item) => {
            if (item.type === 'separator') {
              return <div key={item.id} role="separator" className="my-1 h-px bg-surface-2" />;
            }
            if (item.type === 'heading') {
              return (
                <div
                  key={item.id}
                  role="presentation"
                  className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-muted"
                >
                  {item.label}
                </div>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => {
                  item.onSelect();
                  close();
                }}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-[13px] outline-none enabled:hover:bg-popover-hover focus-visible:bg-popover-hover disabled:opacity-50',
                  item.danger ? 'text-danger' : 'text-default',
                )}
              >
                {item.icon && <span className="flex text-icon">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.checked && (
                  <Check
                    size={14}
                    strokeWidth={2.5}
                    className="text-accent-ink"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
