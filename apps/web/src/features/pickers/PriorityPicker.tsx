import type { Priority } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { PriorityFlag } from '../../components/ui/PriorityFlag';

/** Picker order; the index is the option's number key (0 = No priority … 4 = Low). */
const PRIORITY_PICKER_ORDER = [
  'none',
  'urgent',
  'high',
  'medium',
  'low',
] as const satisfies readonly Priority[];

interface PriorityPickerProps {
  value: Priority;
  onChange: (priority: Priority) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

/**
 * No priority → Low with the bars icon, a "Set priority to…" search and 0–4 number keys
 * (Linear-style, user decision 2026-11-27).
 */
export function PriorityPicker({ value, onChange, trigger, label }: PriorityPickerProps) {
  const { t } = useTranslation();
  return (
    <Popover trigger={trigger} label={label} width={240} elevation="lg" initialFocus={0}>
      {(close) => (
        <div
          onKeyDownCapture={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const priority = PRIORITY_PICKER_ORDER[Number(event.key)];
            if (!/^[0-4]$/.test(event.key) || !priority) return;
            event.preventDefault();
            event.stopPropagation();
            onChange(priority);
            close();
          }}
        >
          <Picker
            items={PRIORITY_PICKER_ORDER}
            value={value}
            getKey={(p) => p}
            getLabel={(p) => t(`priority.${p}`)}
            label={t('picker.priorityLabel')}
            search={{ placeholder: t('picker.setPriorityTo') }}
            onSelect={onChange}
            onClose={close}
            renderItem={(p) => <PriorityFlag priority={p} showLabel />}
            renderTrailing={(p) => (
              <span
                aria-hidden="true"
                className="w-3 flex-none text-right font-mono text-[12px] text-muted"
              >
                {PRIORITY_PICKER_ORDER.indexOf(p)}
              </span>
            )}
          />
        </div>
      )}
    </Popover>
  );
}
