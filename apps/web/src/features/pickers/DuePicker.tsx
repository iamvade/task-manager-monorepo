import { addDays, startOfWeek } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { useDates } from '../../lib/useDates';

interface DuePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

interface DueOption {
  id: string;
  label: string;
  date: string | null;
}

/** Quick dates relative to today (user's time zone), as in CreateTask.dc.html. */
function dueOptions(today: string, t: (key: DueLabelKey) => string): DueOption[] {
  const monday = startOfWeek(today);
  const saturday = addDays(monday, 5);
  return [
    { id: 'today', label: t('dates.today'), date: today },
    { id: 'tomorrow', label: t('dates.tomorrow'), date: addDays(today, 1) },
    {
      id: 'weekend',
      label: t('create.due.thisWeekend'),
      date: saturday > today ? saturday : addDays(saturday, 7),
    },
    { id: 'nextWeek', label: t('create.due.nextWeek'), date: addDays(monday, 7) },
    { id: 'twoWeeks', label: t('create.due.inTwoWeeks'), date: addDays(today, 14) },
    { id: 'none', label: t('create.due.none'), date: null },
  ];
}

type DueLabelKey =
  | 'dates.today'
  | 'dates.tomorrow'
  | 'create.due.thisWeekend'
  | 'create.due.nextWeek'
  | 'create.due.inTwoWeeks'
  | 'create.due.none';

/**
 * Due date picker (264px): a date field on top (CreateTask's "Type a date" row; a native date
 * input), then Today / Tomorrow / This weekend / Next week / In two weeks / No due date with the
 * weekday hint. ⌫ clears.
 */
export function DuePicker({ value, onChange, trigger, label }: DuePickerProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const options = dueOptions(dates.today, (key) => t(key));
  const selected = options.find((o) => o.date === value)?.id ?? null;

  return (
    <Popover trigger={trigger} label={label} width={264} elevation="lg">
      {(close) => (
        <div className="flex flex-col">
          <label className="-mx-1 -mt-1 mb-1 flex h-[38px] items-center gap-2 border-b border-subtle px-3">
            <span className="sr-only">{t('create.typeDate')}</span>
            <input
              type="date"
              value={value ?? ''}
              onChange={(e) => {
                if (!e.target.value) return;
                onChange(e.target.value);
                close();
              }}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-default outline-none focus-visible:outline-none"
            />
          </label>
          <Picker
            items={options}
            value={selected}
            getKey={(o) => o.id}
            getLabel={(o) => o.label}
            label={t('picker.dueLabel')}
            onSelect={(o) => {
              onChange(o.date);
            }}
            onClear={() => {
              onChange(null);
            }}
            onClose={close}
            renderItem={(o) => (
              <>
                <span className="flex-1 truncate">{o.label}</span>
                {o.date && (
                  <span className="text-[12px] text-muted">{dates.formatWeekday(o.date)}</span>
                )}
              </>
            )}
          />
        </div>
      )}
    </Popover>
  );
}
