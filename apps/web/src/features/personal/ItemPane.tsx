import type { PersonalItem, PersonalItemKind } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  useDeletePersonalItem,
  usePersonalItem,
  useRestorePersonalItem,
  useUpdatePersonalItem,
} from '../../api/personal';
import {
  CalendarIcon,
  CheckCircleIcon,
  FolderIcon,
  NoteIcon,
  PrevIcon,
  TrashIcon,
} from '../../components/icons';
import { Checkbox } from '../../components/ui/Checkbox';
import { DueDate } from '../../components/ui/DueDate';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toast';
import { DuePicker } from '../pickers/DuePicker';
import { ErrorState } from '../../components/ErrorState';
import { PersonalEditor } from './PersonalEditor';
import { usePersonalLinks } from './usePersonal';

const chip =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] border-0 bg-transparent px-2 text-[13px] text-2 hover:bg-hover';

/** The open note or to-do: title, kind, topic, due/done, body and its links both ways. */
interface ItemPaneProps {
  itemId: string;
  /** The list this item was opened from (where deleting it goes back to). */
  listHref: string;
  /** Phone: back to the list. */
  onBack?: () => void;
}

export function ItemPane({ itemId, listHref, onBack }: ItemPaneProps) {
  const query = usePersonalItem(itemId);
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3 p-6" aria-busy="true">
        <Skeleton width="50%" height={22} />
        <Skeleton height={88} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} />;
  return (
    <ItemPaneLoaded key={query.data.id} item={query.data} listHref={listHref} onBack={onBack} />
  );
}

function ItemPaneLoaded({
  item,
  listHref,
  onBack,
}: Omit<ItemPaneProps, 'itemId'> & { item: PersonalItem }) {
  const { t } = useTranslation();
  const update = useUpdatePersonalItem();
  const remove = useDeletePersonalItem();
  const restore = useRestorePersonalItem();
  const { index, resolve, itemHref, taskHref, navigate, createAndOpen } = usePersonalLinks();
  const [title, setTitle] = useState(item.title);
  const [prevTitle, setPrevTitle] = useState(item.title);
  if (prevTitle !== item.title) {
    setPrevTitle(item.title);
    setTitle(item.title);
  }
  const topics = index.data?.topics ?? [];
  const topic = topics.find((x) => x.id === item.topicId);
  const done = item.doneAt !== null;
  const outgoing = (index.data?.links ?? [])
    .filter((l) => l.sourceId === item.id)
    .map((l) => ({ link: l, r: resolve(l) }))
    .filter(({ r }) => !(r.kind === 'item' && r.item.id === item.id));

  const saveTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(item.title);
      return;
    }
    if (next !== item.title) update.mutate({ itemId: item.id, title: next });
  };

  return (
    <article
      aria-labelledby="personal-title"
      className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-5"
    >
      <div className="flex flex-wrap items-center gap-1">
        {onBack && (
          <IconButton
            label={t('personal.back')}
            size={32}
            icon={<PrevIcon size={16} />}
            onClick={onBack}
          />
        )}
        <SegmentedControl<PersonalItemKind>
          size="sm"
          label={t('personal.item.kind')}
          value={item.kind}
          options={[
            { value: 'note', label: t('personal.kind.note') },
            { value: 'todo', label: t('personal.kind.todo') },
          ]}
          onChange={(kind) => {
            update.mutate({ itemId: item.id, kind });
          }}
        />
        <Menu
          label={t('personal.item.topic')}
          width={220}
          items={[
            {
              id: 'none',
              label: t('personal.topics.none'),
              checked: item.topicId === null,
              onSelect: () => {
                update.mutate({ itemId: item.id, topicId: null });
              },
            },
            ...topics.map((x) => ({
              id: x.id,
              label: x.name,
              icon: <ProjectDot color={x.color} size={8} />,
              checked: x.id === item.topicId,
              onSelect: () => {
                update.mutate({ itemId: item.id, topicId: x.id });
              },
            })),
          ]}
          trigger={(props, open) => (
            <button type="button" {...props} className={cn(chip, open && 'bg-hover')}>
              {topic ? (
                <ProjectDot color={topic.color} size={8} />
              ) : (
                <FolderIcon size={14} className="text-icon" />
              )}
              {topic?.name ?? t('personal.topics.none')}
            </button>
          )}
        />
        {item.kind === 'todo' && (
          <DuePicker
            label={t('personal.item.due')}
            value={item.dueDate}
            onChange={(dueDate) => {
              if (dueDate !== item.dueDate) update.mutate({ itemId: item.id, dueDate });
            }}
            trigger={(props, open) => (
              <button
                type="button"
                {...props}
                aria-label={t('personal.item.due')}
                className={cn(chip, open && 'bg-hover')}
              >
                <CalendarIcon size={14} className="text-icon" />
                {item.dueDate ? (
                  <DueDate date={item.dueDate} done={done} />
                ) : (
                  t('personal.item.noDue')
                )}
              </button>
            )}
          />
        )}
        <span className="flex-1" />
        <IconButton
          label={t('personal.item.delete')}
          size={32}
          icon={<TrashIcon size={16} />}
          onClick={() => {
            remove.mutate(item.id, {
              onSuccess: () => {
                toast({
                  message: t('personal.item.deleted', { title: item.title }),
                  action: {
                    label: t('common.undo'),
                    onClick: () => {
                      restore.mutate(item.id, {
                        onSuccess: () => void navigate(itemHref(item.id)),
                      });
                    },
                  },
                });
              },
            });
            void navigate(listHref);
          }}
        />
      </div>

      <div className="flex items-start gap-3">
        {item.kind === 'todo' && (
          <Checkbox
            className="mt-[7px]"
            checked={done}
            label={t('personal.item.markDone', { title: item.title })}
            onChange={(checked) => {
              update.mutate({ itemId: item.id, done: checked });
            }}
          />
        )}
        <label htmlFor="personal-title" className="sr-only">
          {t('personal.item.title')}
        </label>
        <input
          id="personal-title"
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              setTitle(item.title);
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded-[6px] border-0 bg-transparent px-1 text-[22px] leading-[30px] font-semibold tracking-[-0.01em] text-default outline-none focus-visible:outline-2 focus-visible:outline-accent-ink',
            done && 'text-muted line-through',
          )}
        />
      </div>

      <PersonalEditor key={item.id} item={item} />

      <section aria-labelledby="personal-links-h" className="flex flex-col gap-2">
        <h2 id="personal-links-h" className="m-0 text-[13px] font-semibold text-2">
          {t('personal.item.linksTo')}
        </h2>
        {outgoing.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">{t('personal.item.noLinks')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 pl-0">
            {outgoing.map(({ link, r }) => (
              <li key={`${link.targetItemId ?? ''}|${link.targetTaskId ?? ''}|${link.title}`}>
                {r.kind === 'item' ? (
                  <Link to={itemHref(r.item.id)} className={rowLink}>
                    {r.item.kind === 'todo' ? (
                      <CheckCircleIcon size={14} />
                    ) : (
                      <NoteIcon size={14} />
                    )}
                    <span className="truncate">{r.item.title}</span>
                  </Link>
                ) : r.kind === 'task' ? (
                  <Link to={taskHref(r.task)} className={rowLink}>
                    <span className="font-mono text-[12px] text-accent-ink">{r.task.key}</span>
                    <span className={cn('truncate', r.task.closed && 'line-through')}>
                      {r.task.title}
                    </span>
                  </Link>
                ) : r.kind === 'unavailable' ? (
                  <span className={cn(rowLink, 'cursor-default text-muted hover:bg-transparent')}>
                    <span className="font-mono text-[12px] line-through">{r.key}</span>
                    {t('personal.link.unavailable')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={cn(rowLink, 'w-full border-0 bg-transparent text-left')}
                    onClick={() => void createAndOpen(r.title)}
                  >
                    <span className="truncate border-b border-dashed border-[var(--text-muted)]">
                      {r.title}
                    </span>
                    <span className="text-[12px] text-muted">
                      {t('personal.link.clickToCreate')}
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="personal-backlinks-h" className="flex flex-col gap-2">
        <h2 id="personal-backlinks-h" className="m-0 text-[13px] font-semibold text-2">
          {t('personal.item.linkedFrom')}
        </h2>
        {item.backlinks.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">{t('personal.item.noBacklinks')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 pl-0">
            {item.backlinks.map((b) => (
              <li key={b.id}>
                <Link to={itemHref(b.id)} className={rowLink}>
                  {b.kind === 'todo' ? <CheckCircleIcon size={14} /> : <NoteIcon size={14} />}
                  <span className="truncate">{b.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

const rowLink =
  'flex h-8 min-w-0 items-center gap-2 rounded-[6px] px-2 text-[13px] text-default no-underline hover:bg-hover';
