import { shortName } from '@kite/shared';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import type { MentionCandidate } from './mentions';

export interface MentionListProps {
  items: MentionCandidate[];
  command: (attrs: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * @-suggestions (TaskDetail.dc.html composer): 240px, "People" header, 34px rows with a 22px
 * avatar, name and role hint; the active row is accent-soft. ↑↓ move, Enter/Tab pick.
 */
export const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command },
  ref,
) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(0);
  }

  const pick = (index: number) => {
    const item = items[index];
    if (item) command({ id: item.id, label: shortName(item.name) });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(active);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label={t('drawer.mentionSuggestions')}
      className="box-border flex w-[240px] flex-col rounded-[10px] border border-default bg-surface p-1 text-default shadow-popover"
    >
      <span className="px-2 py-1 text-[11px] font-medium text-muted">{t('drawer.people')}</span>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === active}
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onMouseMove={() => {
            setActive(index);
          }}
          onClick={() => {
            pick(index);
          }}
          className={cn(
            'flex h-[34px] items-center gap-2 rounded-[6px] border-0 px-2 text-left',
            index === active ? 'bg-accent-soft' : 'bg-transparent',
          )}
        >
          <Avatar user={item} size={22} title={null} />
          <span className="flex-1 truncate text-[13px] font-medium">{shortName(item.name)}</span>
          {item.hint && <span className="text-[12px] text-muted">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
});
