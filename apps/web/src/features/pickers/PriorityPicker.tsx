import { PRIORITIES, type Priority } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { PriorityFlag } from '../../components/ui/PriorityFlag';

interface PriorityPickerProps {
  value: Priority;
  onChange: (priority: Priority) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

/** Urgent → No priority, each with its flag (derived from the CreateTask pickers). */
export function PriorityPicker({ value, onChange, trigger, label }: PriorityPickerProps) {
  const { t } = useTranslation();
  return (
    <Popover trigger={trigger} label={label} width={200} elevation="lg" initialFocus={0}>
      {(close) => (
        <Picker
          items={PRIORITIES}
          value={value}
          getKey={(p) => p}
          getLabel={(p) => t(`priority.${p}`)}
          label={t('picker.priorityLabel')}
          onSelect={onChange}
          onClose={close}
          renderItem={(p) => <PriorityFlag priority={p} showLabel />}
        />
      )}
    </Popover>
  );
}
