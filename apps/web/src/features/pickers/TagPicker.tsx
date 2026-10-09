import type { Tag } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { TagChip } from '../../components/ui/TagChip';

interface TagPickerProps {
  value: readonly Tag[];
  tags: readonly Tag[];
  onChange: (tags: Tag[]) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

/** Multi-select workspace tags with search; options show the tag chip. ⌫ removes all. */
export function TagPicker({ value, tags, onChange, trigger, label }: TagPickerProps) {
  const { t } = useTranslation();
  const selected = value.map((tag) => tag.id);
  return (
    <Popover trigger={trigger} label={label} width={264} elevation="lg">
      {(close) => (
        <Picker
          items={tags}
          value={selected}
          multiple
          getKey={(tag) => tag.id}
          getLabel={(tag) => tag.name}
          label={t('picker.tagsLabel')}
          search={{ placeholder: t('filters.searchTags') }}
          onSelect={(tag) => {
            onChange(
              selected.includes(tag.id) ? value.filter((v) => v.id !== tag.id) : [...value, tag],
            );
          }}
          onClear={() => {
            onChange([]);
          }}
          onClose={close}
          renderItem={(tag) => <TagChip name={tag.name} color={tag.color} />}
        />
      )}
    </Popover>
  );
}
