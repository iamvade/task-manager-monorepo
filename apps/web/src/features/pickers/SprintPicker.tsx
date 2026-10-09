import type { Sprint } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { useDates } from '../../lib/useDates';

interface SprintPickerProps {
  value: string | null;
  sprints: readonly Sprint[];
  onChange: (sprintId: string | null) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

const NONE = 'none';

/** The project's sprints (name + date range) and "No sprint". ⌫ clears. */
export function SprintPicker({ value, sprints, onChange, trigger, label }: SprintPickerProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const items = [...sprints.map((s) => ({ id: s.id, sprint: s })), { id: NONE, sprint: null }];
  return (
    <Popover trigger={trigger} label={label} width={264} elevation="lg">
      {(close) => (
        <Picker
          items={items}
          value={value ?? NONE}
          getKey={(i) => i.id}
          getLabel={(i) => i.sprint?.name ?? t('drawer.noSprint')}
          label={label}
          onSelect={(i) => {
            onChange(i.sprint?.id ?? null);
          }}
          onClear={() => {
            onChange(null);
          }}
          onClose={close}
          renderItem={(i) => (
            <>
              <span className="flex-1 truncate">{i.sprint?.name ?? t('drawer.noSprint')}</span>
              {i.sprint && (
                <span className="text-[12px] text-muted">
                  {dates.formatRange(i.sprint.startDate, i.sprint.endDate)}
                </span>
              )}
            </>
          )}
        />
      )}
    </Popover>
  );
}
