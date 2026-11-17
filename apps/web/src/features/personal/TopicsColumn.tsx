import {
  PALETTE_KEYS,
  type PaletteKey,
  type PersonalIndex,
  type PersonalTopic,
} from '@kite/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  useCreatePersonalTopic,
  useDeletePersonalTopic,
  useMovePersonalTopic,
  useUpdatePersonalTopic,
} from '../../api/personal';
import { isApiError } from '@kite/shared/client';
import { MoreIcon, PlusIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { ColorSwatches } from '../../components/ui/ColorSwatches';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { cn } from '../../lib/cn';
import { colorFor } from '../../lib/palette';
import type { TopicFilter } from './search';

interface TopicsColumnProps {
  index: PersonalIndex | undefined;
  topic: TopicFilter;
  /** Link to the list filtered by a topic (keeps the other params). */
  hrefFor: (topic: TopicFilter) => string;
  kind: 'note' | 'todo';
}

const rowClass =
  'group flex h-8 min-w-0 items-center gap-2 rounded-[8px] px-2 text-[13px] no-underline hover:bg-hover';

/** Topics (one level, like folders): All, No topic, mine with counts; rename, recolor, reorder, delete. */
export function TopicsColumn({ index, topic, hrefFor, kind }: TopicsColumnProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PersonalTopic | null>(null);
  const remove = useDeletePersonalTopic();
  const move = useMovePersonalTopic();
  const topics = index?.topics ?? [];
  const items = (index?.items ?? []).filter((i) => i.kind === kind);
  const count = (id: string | null) => items.filter((i) => i.topicId === id).length;

  return (
    <nav aria-label={t('personal.topics.label')} className="flex flex-col gap-0.5">
      <div className="flex h-8 items-center justify-between pr-1 pl-2">
        <span className="text-[12px] font-medium text-muted">{t('personal.topics.label')}</span>
        <IconButton
          label={t('personal.topics.new')}
          size={24}
          icon={<PlusIcon size={14} />}
          onClick={() => {
            setAdding(true);
          }}
        />
      </div>
      <TopicLink
        to={hrefFor(null)}
        active={topic === null}
        label={t('personal.topics.all')}
        count={items.length}
      />
      <TopicLink
        to={hrefFor('none')}
        active={topic === 'none'}
        label={t('personal.topics.none')}
        count={count(null)}
      />
      {topics.map((x, i) =>
        editing === x.id ? (
          <TopicForm
            key={x.id}
            topic={x}
            onDone={() => {
              setEditing(null);
            }}
          />
        ) : (
          <div key={x.id} className="relative">
            <TopicLink
              to={hrefFor(x.id)}
              active={topic === x.id}
              label={x.name}
              count={count(x.id)}
              dot={x.color}
            />
            <div className="absolute top-1 right-1">
              <Menu
                label={t('personal.topics.actions', { name: x.name })}
                placement="bottom-end"
                width={200}
                items={[
                  {
                    id: 'edit',
                    label: t('personal.topics.edit'),
                    onSelect: () => {
                      setEditing(x.id);
                    },
                  },
                  {
                    id: 'up',
                    label: t('personal.topics.moveUp'),
                    disabled: i === 0,
                    onSelect: () => {
                      const prev = topics[i - 2];
                      const next = topics[i - 1];
                      move.mutate({
                        topicId: x.id,
                        prevId: prev?.id ?? null,
                        nextId: next?.id ?? null,
                      });
                    },
                  },
                  {
                    id: 'down',
                    label: t('personal.topics.moveDown'),
                    disabled: i === topics.length - 1,
                    onSelect: () => {
                      const prev = topics[i + 1];
                      const next = topics[i + 2];
                      move.mutate({
                        topicId: x.id,
                        prevId: prev?.id ?? null,
                        nextId: next?.id ?? null,
                      });
                    },
                  },
                  { type: 'separator', id: 'sep' },
                  {
                    id: 'delete',
                    label: t('personal.topics.delete'),
                    danger: true,
                    onSelect: () => {
                      setDeleting(x);
                    },
                  },
                ]}
                trigger={(props, open) => (
                  <button
                    type="button"
                    {...props}
                    aria-label={t('personal.topics.actions', { name: x.name })}
                    className={cn(
                      'flex size-6 items-center justify-center rounded-[6px] border-0 bg-transparent text-icon hover:bg-hover focus-visible:opacity-100',
                      open
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 [div:hover>&]:opacity-100',
                    )}
                  >
                    <MoreIcon size={14} />
                  </button>
                )}
              />
            </div>
          </div>
        ),
      )}
      {adding && (
        <TopicForm
          onDone={() => {
            setAdding(false);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={t('personal.topics.deleteTitle', { name: deleting?.name ?? '' })}
        body={t('personal.topics.deleteBody')}
        confirmLabel={t('personal.topics.delete')}
        tone="danger"
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSettled: () => {
              setDeleting(null);
            },
          });
        }}
      />
    </nav>
  );
}

function TopicLink({
  to,
  active,
  label,
  count,
  dot,
}: {
  to: string;
  active: boolean;
  label: string;
  count: number;
  dot?: PaletteKey;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        rowClass,
        'pr-8',
        active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-2',
      )}
    >
      {dot ? <ProjectDot color={dot} size={8} /> : <span className="w-2 flex-none" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[12px] text-muted">{count}</span>
    </Link>
  );
}

/** New topic, or rename + recolor an existing one. */
function TopicForm({ topic, onDone }: { topic?: PersonalTopic; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreatePersonalTopic();
  const update = useUpdatePersonalTopic();
  const [name, setName] = useState(topic?.name ?? '');
  const [color, setColor] = useState<PaletteKey | null>(topic?.color ?? null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      onDone();
      return;
    }
    const onError = (err: unknown) => {
      setError(
        isApiError(err, 'TOPIC_EXISTS') ? t('personal.topics.exists') : t('common.genericError'),
      );
    };
    if (topic) {
      update.mutate(
        { topicId: topic.id, name: trimmed, color: color ?? topic.color },
        { onSuccess: onDone, onError },
      );
    } else {
      create.mutate(
        { name: trimmed, color: color ?? colorFor(trimmed) },
        { onSuccess: onDone, onError },
      );
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[8px] border border-default p-2">
      <input
        aria-label={t('personal.topics.name')}
        placeholder={t('personal.topics.namePlaceholder')}
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
        className="h-8 rounded-[6px] border border-control bg-control px-2 text-[13px] text-default outline-none focus-visible:outline-2 focus-visible:outline-accent-ink"
      />
      <ColorSwatches
        colors={PALETTE_KEYS.filter((k) => k !== 'neutral')}
        family="project"
        value={color ?? colorFor(name || 'x')}
        onChange={setColor}
        label={t('personal.topics.color')}
      />
      {error && (
        <p role="alert" className="m-0 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={create.isPending || update.isPending}
        >
          {topic ? t('personal.topics.save') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}
