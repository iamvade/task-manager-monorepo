import { SIZES, SIZE_POINTS, type Size } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useSizeTitle } from './sizeTitle';

interface SizeControlProps {
  value: Size | null;
  onChange: (size: Size | null) => void;
  className?: string;
}

/**
 * The Size control of the task drawer (TaskDetail.dc.html): S / M / L / XL radiogroup and the
 * points hint. Clicking the selected size clears it (unsized: nothing selected, "No size" hint).
 */
export function SizeControl({ value, onChange, className }: SizeControlProps) {
  const { t } = useTranslation();
  const title = useSizeTitle();
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-2.5'}>
      <SegmentedControl
        label={t('taskSize.label')}
        size="chip"
        options={SIZES.map((size) => ({ value: size, label: size, title: title(size) }))}
        value={value}
        onChange={onChange}
        onClear={() => {
          onChange(null);
        }}
      />
      <span className="text-[12px] text-muted">
        {value
          ? t('taskSize.hint', { points: t('taskSize.points', { count: SIZE_POINTS[value] }) })
          : t('taskSize.hintNone')}
      </span>
    </div>
  );
}
