import { SIZES, SIZE_POINTS, type Size } from '@kite/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';

interface SizePickerProps {
  value: Size | null;
  onChange: (size: Size | null) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
}

const NONE = 'none';
type Item = Size | typeof NONE;

/** S / M / L / XL with points and a hint, plus "No size" (quick create, list cell). ⌫ clears. */
export function SizePicker({ value, onChange, trigger, label }: SizePickerProps) {
  const { t } = useTranslation();
  const items: Item[] = [...SIZES, NONE];
  return (
    <Popover trigger={trigger} label={label} width={280} elevation="lg" initialFocus={0}>
      {(close) => (
        <Picker<Item>
          items={items}
          value={value ?? NONE}
          getKey={(s) => s}
          getLabel={(s) => (s === NONE ? t('taskSize.none') : s)}
          label={label}
          onSelect={(s) => {
            onChange(s === NONE ? null : s);
          }}
          onClear={() => {
            onChange(null);
          }}
          onClose={close}
          renderItem={(s) =>
            s === NONE ? (
              <span className="flex-1 truncate text-muted">{t('taskSize.none')}</span>
            ) : (
              <>
                <span className="w-6 flex-none font-semibold">{s}</span>
                <span className="flex-1 truncate text-[12px] text-muted">
                  {t('taskSize.points', { count: SIZE_POINTS[s] })} ·{' '}
                  {t(`taskSize.description.${s}`)}
                </span>
              </>
            )
          }
        />
      )}
    </Popover>
  );
}
