import { canManageTags, nameSearchKey, type Tag } from '@kite/shared';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { useCreateTag, useTags } from '../../api/tags';
import { useCurrentWorkspace } from '../../api/workspaces';
import { PlusIcon } from '../../components/icons';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { TagChip } from '../../components/ui/TagChip';
import { reportError } from '../../lib/mutationErrors';
import { colorFor } from '../../lib/palette';

interface TagPickerProps {
  value: readonly Tag[];
  tags: readonly Tag[];
  onChange: (tags: Tag[]) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

/** Id of the "Create tag “…”" row. */
const CREATE = 'create';
type Row = { kind: 'tag'; tag: Tag } | { kind: 'create'; name: string };

/**
 * Multi-select workspace tags with search; options show the tag chip. ⌫ removes all. For admins
 * and owners, a query no tag has exactly offers "Create tag “…”" first (not designed); the new
 * tag is selected. Members pick from the existing tags (Settings → Tags lists them).
 */
export function TagPicker({ value, tags, onChange, trigger, label }: TagPickerProps) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const create = useCreateTag(workspace?.id);
  const fresh = useTags(workspace?.id);
  const [query, setQuery] = useState('');
  const selected = value.map((tag) => tag.id);
  const name = query.trim();
  const key = nameSearchKey(name);
  const matches = tags.filter((tag) => nameSearchKey(tag.name).includes(key));
  const exact = tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase());
  const canCreate = workspace ? canManageTags(workspace.role) : false;
  const rows: Row[] = [
    ...(name && !exact && canCreate ? [{ kind: 'create', name } as const] : []),
    ...matches.map((tag) => ({ kind: 'tag', tag }) as const),
  ];

  const toggle = (tag: Tag) => {
    onChange(selected.includes(tag.id) ? value.filter((v) => v.id !== tag.id) : [...value, tag]);
  };

  const createTag = (tagName: string) => {
    create.mutate(
      { name: tagName, color: colorFor(tagName) },
      {
        onSuccess: (tag) => {
          setQuery('');
          onChange([...value, tag]);
        },
        onError: (err) => {
          // Someone made it meanwhile: pick theirs.
          if (err instanceof ApiError && err.code === 'TAG_EXISTS') {
            void fresh.refetch().then(({ data }) => {
              const tag = data?.find((x) => x.name.toLowerCase() === tagName.toLowerCase());
              if (tag && !selected.includes(tag.id)) onChange([...value, tag]);
            });
            return;
          }
          reportError(err, t('picker.createTagFailed'));
        },
      },
    );
  };

  return (
    <Popover
      trigger={trigger}
      label={label}
      width={264}
      elevation="lg"
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
      {(close) => (
        <Picker<Row>
          items={rows}
          value={selected}
          multiple
          getKey={(row) => (row.kind === 'tag' ? row.tag.id : CREATE)}
          getLabel={(row) =>
            row.kind === 'tag' ? row.tag.name : t('picker.createTag', { name: row.name })
          }
          label={t('picker.tagsLabel')}
          search={{ placeholder: t('filters.searchTags') }}
          query={query}
          onQueryChange={setQuery}
          onSelect={(row) => {
            if (row.kind === 'tag') toggle(row.tag);
            else if (!create.isPending) createTag(row.name);
          }}
          onClear={() => {
            onChange([]);
          }}
          onClose={close}
          renderItem={(row) =>
            row.kind === 'tag' ? (
              <TagChip name={row.tag.name} color={row.tag.color} />
            ) : (
              <span className="flex min-w-0 items-center gap-2 text-2">
                <PlusIcon size={14} className="flex-none text-icon" />
                <span className="truncate">{t('picker.createTag', { name: row.name })}</span>
              </span>
            )
          }
        />
      )}
    </Popover>
  );
}
