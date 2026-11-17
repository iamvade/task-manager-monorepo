import { Fragment, forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, LinkIcon, NoteIcon, PlusIcon } from '../../../components/icons';
import { cn } from '../../../lib/cn';
import type { LinkSuggestion } from './personalLinks';

export interface LinkSuggestProps {
  items: LinkSuggestion[];
  command: (row: LinkSuggestion) => void;
}

export interface LinkSuggestHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const keyOf = (row: LinkSuggestion) =>
  row.type === 'item' ? row.id : row.type === 'task' ? row.taskId : `${row.type}:${row.title}`;

/**
 * The `[[` popup (built like the @-suggestions): my notes and to-dos, "Create …" and "Link
 * without creating", then team tasks. ↑↓ move, Enter/Tab pick, typing `]]` links the title.
 */
export const LinkSuggestList = forwardRef<LinkSuggestHandle, LinkSuggestProps>(
  function LinkSuggestList({ items, command }, ref) {
    const { t } = useTranslation();
    const [active, setActive] = useState(0);
    const [prevItems, setPrevItems] = useState(items);
    if (prevItems !== items) {
      setPrevItems(items);
      setActive(0);
    }

    const pick = (index: number) => {
      const row = items[index];
      if (row) command(row);
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
    const firstTask = items.findIndex((r) => r.type === 'task');
    return (
      <div
        role="listbox"
        aria-label={t('personal.link.suggestions')}
        className="box-border flex max-h-[320px] w-[300px] flex-col overflow-y-auto rounded-[10px] border border-default bg-surface p-1 text-default shadow-popover"
      >
        {items[0]?.type !== 'task' && (
          <span className="px-2 py-1 text-[11px] font-medium text-muted">
            {t('personal.link.mine')}
          </span>
        )}
        {items.map((row, index) => {
          let icon: ReactNode;
          let label: string;
          let hint: string | null = null;
          if (row.type === 'item') {
            icon = row.kind === 'todo' ? <CheckCircleIcon size={14} /> : <NoteIcon size={14} />;
            label = row.title;
          } else if (row.type === 'create') {
            icon = <PlusIcon size={14} />;
            label = t('personal.link.create', { title: row.title });
          } else if (row.type === 'uncreated') {
            icon = <LinkIcon size={14} />;
            label = t('personal.link.withoutCreating');
          } else {
            icon = null;
            label = row.title;
            hint = row.key;
          }
          return (
            <Fragment key={keyOf(row)}>
              {index === firstTask && (
                <span className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted">
                  {t('personal.link.teamTasks')}
                </span>
              )}
              <button
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
                  'flex h-[34px] flex-none items-center gap-2 rounded-[6px] border-0 px-2 text-left',
                  index === active ? 'bg-accent-soft' : 'bg-transparent',
                )}
              >
                {hint ? (
                  <span className="flex-none font-mono text-[12px] text-2">{hint}</span>
                ) : (
                  <span className="flex flex-none text-icon">{icon}</span>
                )}
                <span className="flex-1 truncate text-[13px] font-medium">{label}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
    );
  },
);
