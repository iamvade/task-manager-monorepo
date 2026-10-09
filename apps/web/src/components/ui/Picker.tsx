import { Check, Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { Kbd } from './Kbd';

interface PickerProps<T> {
  items: readonly T[];
  /** Selected key(s); `null` = nothing selected. */
  value: string | readonly string[] | null;
  getKey: (item: T) => string;
  /** Text used for the default search filter and the option's accessible name. */
  getLabel: (item: T) => string;
  renderItem?: (item: T, state: { selected: boolean; active: boolean }) => ReactNode;
  /** Called with the picked item; multi-select pickers stay open. */
  onSelect: (item: T) => void;
  /** Backspace on an empty search (e.g. unassign). */
  onClear?: () => void;
  onClose?: () => void;
  multiple?: boolean;
  search?: { placeholder: string; filter?: (item: T, query: string) => boolean };
  groupBy?: (item: T) => string;
  emptyText?: string;
  /** Accessible name of the listbox. */
  label: string;
  /** Show the ↑↓ ↵ (⌫) hints footer. */
  footerHints?: boolean;
}

/**
 * Searchable listbox for assignee / due / project / status pickers. Lives inside a Popover.
 * ↑↓ move, ↵ selects, ⌫ on an empty query clears, Esc closes (handled by the Popover).
 * Search 38px, options 32px r6, selected ✓ in accent-ink, active row --popover-hover.
 */
export function Picker<T>({
  items,
  value,
  getKey,
  getLabel,
  renderItem,
  onSelect,
  onClear,
  onClose,
  multiple,
  search,
  groupBy,
  emptyText,
  label,
  footerHints,
}: PickerProps<T>) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selectedKeys = useMemo(
    () => new Set(value === null ? [] : typeof value === 'string' ? [value] : value),
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const match = search?.filter ?? ((item: T) => getLabel(item).toLowerCase().includes(q));
    return items.filter((item) => match(item, q));
  }, [items, query, search, getLabel]);

  const activeIndex = Math.min(active, filtered.length - 1);

  function pick(item: T) {
    onSelect(item);
    if (!multiple) onClose?.();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) pick(item);
    } else if (event.key === 'Backspace' && query === '' && onClear) {
      event.preventDefault();
      onClear();
      if (!multiple) onClose?.();
    }
  }

  const optionId = (index: number) => `${id}-opt-${index}`;
  const groups = groupBy ? filtered.map(groupBy) : [];

  return (
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      {search && (
        <div className="-mx-1 -mt-1 mb-1 flex h-[38px] items-center gap-2 border-b border-subtle px-3">
          <Search size={14} className="flex-none text-icon" aria-hidden="true" />
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={filtered.length ? optionId(activeIndex) : undefined}
            aria-label={search.placeholder}
            placeholder={search.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none placeholder:text-faint focus-visible:outline-none"
          />
        </div>
      )}
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple ? true : undefined}
        tabIndex={search ? -1 : 0}
        aria-activedescendant={!search && filtered.length ? optionId(activeIndex) : undefined}
        className="flex max-h-[280px] flex-col overflow-y-auto outline-none"
      >
        {filtered.length === 0 && (
          <div className="px-2 py-2 text-[13px] text-muted">
            {emptyText ?? t('common.noResults')}
          </div>
        )}
        {filtered.map((item, index) => {
          const key = getKey(item);
          const selected = selectedKeys.has(key);
          const isActive = index === activeIndex;
          const group = groups[index];
          const header = group !== undefined && group !== groups[index - 1];
          return (
            <div key={key} role="presentation">
              {header && (
                <div
                  role="presentation"
                  className="px-2 pt-2 pb-1 text-[12px] font-medium text-muted"
                >
                  {group}
                </div>
              )}
              <div
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onMouseMove={() => {
                  setActive(index);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  pick(item);
                }}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px]',
                  isActive && 'bg-popover-hover',
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {renderItem ? (
                    renderItem(item, { selected, active: isActive })
                  ) : (
                    <span className="truncate">{getLabel(item)}</span>
                  )}
                </span>
                {selected && (
                  <Check
                    size={14}
                    strokeWidth={2.5}
                    className="flex-none text-accent-ink"
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {footerHints && (
        <div className="-mx-1 -mb-1 mt-1 flex items-center gap-3 rounded-b-[10px] border-t border-subtle bg-subtle px-3 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Kbd>↑↓</Kbd> {t('picker.navigate')}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> {t('picker.select')}
          </span>
          {onClear && (
            <span className="flex items-center gap-1">
              <Kbd>⌫</Kbd> {t('picker.clear')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
