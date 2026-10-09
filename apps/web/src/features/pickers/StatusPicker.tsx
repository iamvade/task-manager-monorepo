import type { Status } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { StatusDot } from '../../components/ui/StatusDot';

type StatusOption = Pick<Status, 'id' | 'name' | 'category'>;

interface StatusPickerProps {
  value: string;
  statuses: readonly StatusOption[];
  onChange: (status: StatusOption) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

/** The project's statuses with their markers and an accent ✓ (TaskDetail.dc.html, 220px listbox). */
export function StatusPicker({ value, statuses, onChange, trigger, label }: StatusPickerProps) {
  const { t } = useTranslation();
  const name = (s: StatusOption) => s.name ?? t(`status.${s.category}`);
  return (
    <Popover trigger={trigger} label={label} width={220}>
      {(close) => (
        <Picker
          items={statuses}
          value={value}
          getKey={(s) => s.id}
          getLabel={name}
          label={label}
          onSelect={onChange}
          onClose={close}
          renderItem={(s) => (
            <>
              <StatusDot category={s.category} />
              <span className="flex-1 truncate">{name(s)}</span>
            </>
          )}
        />
      )}
    </Popover>
  );
}
