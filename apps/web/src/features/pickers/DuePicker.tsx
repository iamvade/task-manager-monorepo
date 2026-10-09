import { addDays, startOfWeek } from '@kite/shared';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { parseDue } from '../../lib/parseDue';
import { useDates } from '../../lib/useDates';

interface DuePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
 * Due date picker (264px): "Type a date, e.g. “next fri”" on top (English via chrono-node,
 * simple Mongolian keywords), then Today / Tomorrow / This weekend / Next week / In two weeks /
 * No due date with the resolved date. A typed date shows as the first option; ⌫ clears.
 */
export function DuePicker({ value, onChange, trigger, label, open, onOpenChange }: DuePickerProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const [query, setQuery] = useState('');
  const presets = dueOptions(dates.today, (key) => t(key));
  const selected = presets.find((o) => o.date === value)?.id ?? (value ? `typed:${value}` : null);

  const q = query.trim().toLowerCase();
  const parsed = q ? parseDue(q, dates.today) : null;
  const matching = q ? presets.filter((o) => o.label.toLowerCase().includes(q)) : presets;
  const options: DueOption[] =
    parsed && !matching.some((o) => o.date === parsed)
      ? [{ id: `typed:${parsed}`, label: dates.formatWeekday(parsed), date: parsed }, ...matching]
      : matching;

  return (
    <Popover
      trigger={trigger}
      label={label}
      width={264}
      elevation="lg"
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange?.(next);
      }}
    >
      {(close) => (
        <Picker
          items={options}
          value={selected}
          getKey={(o) => o.id}
          getLabel={(o) => o.label}
          label={t('picker.dueLabel')}
          search={{ placeholder: t('create.typeDatePlaceholder') }}
          query={query}
          onQueryChange={setQuery}
          onSelect={(o) => {
            onChange(o.date);
          }}
          onClear={() => {
            onChange(null);
          }}
          onClose={() => {
            setQuery('');
            close();
          }}
          renderItem={(o) => (
            <>
              <span className="flex-1 truncate">{o.label}</span>
              {o.date && !o.id.startsWith('typed:') && (
                <span className="text-[12px] text-muted">{dates.formatWeekday(o.date)}</span>
              )}
              {o.id.startsWith('typed:') && q && (
                <span className="truncate text-[12px] text-muted">{query.trim()}</span>
              )}
            </>
          )}
        />
      )}
    </Popover>
  );
}
