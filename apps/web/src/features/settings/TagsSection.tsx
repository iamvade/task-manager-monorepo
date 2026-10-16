import {
  PALETTE_KEYS,
  canManageTags,
  nameSearchKey,
  tagNameSchema,
  type PaletteKey,
  type TagWithUsage,
  type WorkspaceRole,
} from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../../api/tags';
import { MoreIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { ColorSwatches } from '../../components/ui/ColorSwatches';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { Popover } from '../../components/ui/Popover';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { TagChip } from '../../components/ui/TagChip';
import { cn } from '../../lib/cn';
import { reportError } from '../../lib/mutationErrors';
import { colorFor, paletteClass } from '../../lib/palette';
import { toast } from '../../stores/toast';
import { SettingsSection, settingsInput } from './SettingsRow';
import { MergeTagDialog } from './TagDialogs';

interface TagsSectionProps {
  workspaceId: string;
  /** Admins and owners manage tags; members only see the list. */
  role: WorkspaceRole;
}

type Sort = 'name' | 'usage';

/**
 * Settings → Tags (not designed): the workspace's tags with how many tasks carry each. Admins
 * and owners create, rename, recolor, merge and delete them; delete and merge ask first.
 */
export function TagsSection({ workspaceId, role }: TagsSectionProps) {
  const { t } = useTranslation();
  const tags = useTags(workspaceId);
  const canManage = canManageTags(role);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState<TagWithUsage | null>(null);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);
  const remove = useDeleteTag(workspaceId);

  const key = nameSearchKey(query.trim());
  const shown = (tags.data ?? [])
    .filter((tag) => nameSearchKey(tag.name).includes(key))
    .sort((a, b) => (sort === 'usage' ? b.taskCount - a.taskCount : 0));

  return (
    <div className="flex flex-col gap-8">
      {!canManage && (
        <p className="m-0 rounded-[8px] bg-subtle px-3 py-2.5 text-[13px] text-3">
          {t('settings.tags.adminsOnly')}
        </p>
      )}
      <SettingsSection title={t('settings.tags.title')} description={t('settings.tags.hint')}>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <label className="relative flex min-w-0 flex-[1_1_200px]">
            <span className="sr-only">{t('settings.tags.search')}</span>
            <SearchIcon
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-icon"
            />
            <input
              type="search"
              value={query}
              placeholder={t('settings.tags.search')}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              className={cn(settingsInput, 'w-full pl-8')}
            />
          </label>
          <SegmentedControl<Sort>
            size="md"
            label={t('settings.tags.sortLabel')}
            value={sort}
            onChange={setSort}
            options={[
              { value: 'name', label: t('settings.tags.sortName') },
              { value: 'usage', label: t('settings.tags.sortUsage') },
            ]}
          />
          {canManage && (
            <Button
              size="md"
              variant="primary"
              icon={<PlusIcon size={14} />}
              disabled={creating}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('settings.tags.new')}
            </Button>
          )}
        </div>
        {creating && (
          <NewTagForm
            workspaceId={workspaceId}
            onDone={() => {
              setCreating(false);
            }}
          />
        )}
        {tags.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 border-t border-subtle py-3 text-[13px] text-muted"
          >
            {t('settings.tags.loadError')}
            <Button size="sm" onClick={() => void tags.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !tags.data ? (
          <div className="flex flex-col gap-3 border-t border-subtle py-3" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={28} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="m-0 border-t border-subtle py-3 text-[13px] text-muted">
            {key ? t('settings.tags.noMatch', { query: query.trim() }) : t('settings.tags.empty')}
          </p>
        ) : (
          <ul className="m-0 list-none pl-0">
            {shown.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                workspaceId={workspaceId}
                canManage={canManage}
                canMerge={tags.data.length > 1}
                onMerge={() => {
                  setMerging(tag);
                }}
                onDelete={() => {
                  setDeleting(tag);
                }}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
      <MergeTagDialog
        workspaceId={workspaceId}
        tag={merging}
        tags={tags.data ?? []}
        onClose={() => {
          setMerging(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t('settings.tags.deleteTitle', { name: deleting?.name ?? '' })}
        body={
          deleting && deleting.taskCount > 0
            ? t('settings.tags.deleteBody', { count: deleting.taskCount })
            : t('settings.tags.deleteBodyUnused')
        }
        confirmLabel={t('settings.tags.delete')}
        tone="danger"
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          const { id, name } = deleting;
          remove.mutate(id, {
            onSuccess: () => {
              setDeleting(null);
              toast({ message: t('settings.tags.deleted', { name }) });
            },
          });
        }}
      />
    </div>
  );
}

/** The "New tag" row: name + color (defaults to the name's hashed color until one is picked). */
function NewTagForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateTag(workspaceId);
  const nameId = useId();
  const colorId = useId();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<PaletteKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parsed = tagNameSchema.safeParse(name);
  const color = picked ?? colorFor(name.trim());

  function submit() {
    if (!parsed.success || create.isPending) return;
    create.mutate(
      { name: parsed.data, color },
      {
        onSuccess: (tag) => {
          toast({ message: t('settings.tags.created', { name: tag.name }) });
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'TAG_EXISTS') {
            setError(t('settings.tags.exists', { name: parsed.data }));
            return;
          }
          reportError(err, t('picker.createTagFailed'));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-subtle py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={nameId} className="sr-only">
          {t('settings.tags.nameLabel')}
        </label>
        <input
          id={nameId}
          autoFocus
          value={name}
          maxLength={40}
          placeholder={t('settings.tags.nameLabel')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${nameId}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onDone();
          }}
          className={cn(settingsInput, error && 'border-danger')}
        />
        {parsed.success && <TagChip name={parsed.data} color={color} />}
      </div>
      {error && (
        <span id={`${nameId}-error`} role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <span id={colorId} className="text-[12px] font-medium text-2">
          {t('settings.tags.colorLabel')}
        </span>
        <ColorSwatches
          colors={PALETTE_KEYS}
          family="tag"
          labelledBy={colorId}
          value={color}
          onChange={setPicked}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!parsed.success || create.isPending}
        >
          {t('common.create')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function TagRow({
  tag,
  workspaceId,
  canManage,
  canMerge,
  onMerge,
  onDelete,
}: {
  tag: TagWithUsage;
  workspaceId: string;
  canManage: boolean;
  canMerge: boolean;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateTag(workspaceId);
  const [renaming, setRenaming] = useState(false);
  const colorName = t(`settings.colors.${tag.color}`);
  const swatch = cn('pal-fill size-4 flex-none rounded-full', paletteClass('tag', tag.color));

  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-subtle py-2">
      {canManage ? (
        <Popover
          label={t('settings.tags.colorOf', { name: tag.name })}
          role="dialog"
          width={264}
          elevation="lg"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`${t('settings.tags.colorOf', { name: tag.name })}: ${colorName}`}
              title={colorName}
              className="flex size-7 flex-none items-center justify-center rounded-[6px] border-0 bg-transparent p-0 hover:bg-hover"
            >
              <span className={swatch} />
            </button>
          )}
        >
          {(close) => (
            <div className="p-2">
              <ColorSwatches
                colors={PALETTE_KEYS}
                family="tag"
                label={t('settings.tags.colorOf', { name: tag.name })}
                value={tag.color}
                onChange={(color) => {
                  update.mutate({ tagId: tag.id, color });
                  close();
                }}
              />
            </div>
          )}
        </Popover>
      ) : (
        <span className="flex size-7 flex-none items-center justify-center" title={colorName}>
          <span className={swatch} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center">
        {renaming ? (
          <RenameInput
            tag={tag}
            pending={update.isPending}
            onCancel={() => {
              setRenaming(false);
            }}
            onSave={(name, onError) => {
              update.mutate(
                { tagId: tag.id, name },
                {
                  onSuccess: () => {
                    setRenaming(false);
                  },
                  onError,
                },
              );
            }}
          />
        ) : (
          <TagChip name={tag.name} color={tag.color} />
        )}
      </div>
      <span className="flex-none text-[12px] text-muted tabular-nums">
        {t('settings.tags.tasks', { count: tag.taskCount })}
      </span>
      {canManage && (
        <Menu
          label={t('settings.tags.actions', { name: tag.name })}
          placement="bottom-end"
          width={200}
          items={[
            {
              id: 'rename',
              label: t('settings.tags.rename'),
              onSelect: () => {
                setRenaming(true);
              },
            },
            {
              id: 'merge',
              label: t('settings.tags.merge'),
              disabled: !canMerge,
              onSelect: onMerge,
            },
            { type: 'separator', id: 'sep' },
            { id: 'delete', label: t('settings.tags.delete'), danger: true, onSelect: onDelete },
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label={t('settings.tags.actions', { name: tag.name })}
              size={28}
              icon={<MoreIcon size={14} className="text-icon" />}
            />
          )}
        />
      )}
    </li>
  );
}

/** Inline rename: Enter saves, Esc or Cancel backs out; a taken name shows under the field. */
function RenameInput({
  tag,
  pending,
  onSave,
  onCancel,
}: {
  tag: TagWithUsage;
  pending: boolean;
  onSave: (name: string, onError: (err: unknown) => void) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const parsed = tagNameSchema.safeParse(name);

  function save() {
    if (!parsed.success || pending) return;
    if (parsed.data === tag.name) {
      onCancel();
      return;
    }
    onSave(parsed.data, (err) => {
      if (err instanceof ApiError && err.code === 'TAG_EXISTS') {
        setError(t('settings.tags.exists', { name: parsed.data }));
        return;
      }
      reportError(err, t('common.genericError'));
    });
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <input
          autoFocus
          value={name}
          maxLength={40}
          aria-label={t('settings.tags.renameLabel', { name: tag.name })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            }
          }}
          className={cn(settingsInput, 'w-[220px]', error && 'border-danger')}
        />
        <Button type="submit" size="sm" variant="primary" disabled={!parsed.success || pending}>
          {t('settings.tags.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {error && (
        <span id={`${id}-error`} role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      )}
    </form>
  );
}
