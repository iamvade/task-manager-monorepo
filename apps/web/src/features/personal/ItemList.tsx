import {
  findUncreated,
  findUnlinked,
  type PersonalIndex,
  type PersonalItemKind,
  type PersonalItemSummary,
} from '@kite/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useUpdatePersonalItem } from '../../api/personal';
import { Checkbox } from '../../components/ui/Checkbox';
import { DueDate } from '../../components/ui/DueDate';
import { NoteIcon, PlusIcon } from '../../components/icons';
import { cn } from '../../lib/cn';
import type { ListFilter, TopicFilter } from './search';
import { usePersonalLinks } from './usePersonal';

interface ItemListProps {
  index: PersonalIndex;
  kind: PersonalItemKind;
  topic: TopicFilter;
  filter: ListFilter;
  /** Link to the list with another filter (keeps the other params). */
  filterHref: (filter: ListFilter) => string;
  /** Link to an item, keeping the list's params. */
  itemHref: (id: string) => string;
  selectedId: string | undefined;
}

/** Notes or to-dos of the chosen topic, a quick-add field and the Unlinked / Not created yet helpers. */
export function ItemList({
  index,
  kind,
  topic,
  filter,
  filterHref,
  itemHref,
  selectedId,
}: ItemListProps) {
  const { t } = useTranslation();
  const update = useUpdatePersonalItem();
  const { createAndOpen } = usePersonalLinks();
  const [title, setTitle] = useState('');
  const topicId = topic && topic !== 'none' ? topic : null;

  const inTopic = (i: PersonalItemSummary) =>
    topic === null ? true : topic === 'none' ? i.topicId === null : i.topicId === topic;
  const unlinkedIds = new Set(findUnlinked(index.items, index.links).map((i) => i.id));
  let rows = index.items.filter((i) => i.kind === kind && inTopic(i));
  if (filter === 'unlinked') rows = rows.filter((i) => unlinkedIds.has(i.id));
  if (kind === 'todo') {
    rows = [...rows.filter((i) => !i.doneAt), ...rows.filter((i) => i.doneAt)];
  }
  const uncreated = filter === 'uncreated' ? findUncreated(index.items, index.links) : [];
  const titleOf = new Map(index.items.map((i) => [i.id, i.title]));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle('');
    void createAndOpen(trimmed, kind, topicId);
  };

  const filters: { value: ListFilter; label: string }[] = [
    { value: 'all', label: t('personal.filter.all') },
    { value: 'unlinked', label: t('personal.filter.unlinked') },
    { value: 'uncreated', label: t('personal.filter.uncreated') },
  ];

  return (
    <div className="flex min-h-0 flex-col">
      <form onSubmit={add} className="flex items-center gap-2 border-b border-default px-3 py-2">
        <PlusIcon size={16} className="flex-none text-icon" />
        <input
          aria-label={kind === 'todo' ? t('personal.list.newTodo') : t('personal.list.newNote')}
          placeholder={kind === 'todo' ? t('personal.list.newTodo') : t('personal.list.newNote')}
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className="h-8 min-w-0 flex-1 rounded-[6px] border-0 bg-transparent px-1 text-[13px] text-default outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent-ink"
        />
      </form>
      <div
        role="group"
        aria-label={t('personal.filter.label')}
        className="flex flex-wrap gap-1 px-3 py-2"
      >
        {filters.map((f) => (
          <Link
            key={f.value}
            to={filterHref(f.value)}
            aria-current={filter === f.value ? 'true' : undefined}
            className={cn(
              'inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-medium no-underline',
              filter === f.value
                ? 'border-transparent bg-accent-soft text-accent-ink'
                : 'border-default bg-transparent text-2 hover:bg-hover',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {filter === 'uncreated' ? (
        uncreated.length === 0 ? (
          <p className="m-0 px-4 py-6 text-[13px] text-muted">{t('personal.list.noUncreated')}</p>
        ) : (
          <ul
            aria-label={t('personal.filter.uncreated')}
            className="m-0 list-none overflow-y-auto pl-0"
          >
            {uncreated.map((u) => (
              <li key={u.title} className="flex items-center gap-2 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate border-b border-dashed border-transparent text-[13px] font-medium">
                    {u.title}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {t('personal.list.linkedFrom', {
                      titles: u.sourceIds.map((id) => titleOf.get(id) ?? '').join(', '),
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void createAndOpen(u.title, 'note', topicId)}
                  className="h-7 flex-none rounded-[6px] border border-default bg-transparent px-2 text-[12px] font-medium text-2 hover:bg-hover"
                >
                  {t('personal.list.create')}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 ? (
        <p className="m-0 px-4 py-6 text-[13px] text-muted">
          {filter === 'unlinked'
            ? t('personal.list.noUnlinked')
            : kind === 'todo'
              ? t('personal.list.emptyTodos')
              : t('personal.list.emptyNotes')}
        </p>
      ) : (
        <ul
          aria-label={kind === 'todo' ? t('personal.kind.todos') : t('personal.kind.notes')}
          className="m-0 list-none overflow-y-auto pl-0"
        >
          {rows.map((item) => {
            const done = item.doneAt !== null;
            return (
              <li
                key={item.id}
                className={cn(
                  'flex h-11 items-center gap-2 px-3',
                  item.id === selectedId ? 'bg-accent-soft' : 'hover:bg-hover',
                )}
              >
                {kind === 'todo' ? (
                  <Checkbox
                    checked={done}
                    label={t('personal.item.markDone', { title: item.title })}
                    onChange={(checked) => {
                      update.mutate({ itemId: item.id, done: checked });
                    }}
                  />
                ) : (
                  <NoteIcon size={14} className="flex-none text-icon" />
                )}
                <Link
                  to={itemHref(item.id)}
                  aria-current={item.id === selectedId ? 'page' : undefined}
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px] no-underline',
                    item.id === selectedId ? 'font-medium text-accent-ink' : 'text-default',
                    done && 'text-muted line-through',
                  )}
                >
                  {item.title}
                </Link>
                {item.dueDate && (
                  <DueDate date={item.dueDate} done={done} className="text-[12px]" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
