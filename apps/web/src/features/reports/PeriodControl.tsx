import { REPORT_PERIODS, addDays, type ReportPeriod } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportFilters } from '../../api/reports';
import { Button } from '../../components/ui/Button';
import { DateField } from '../../components/ui/DateField';
import { Popover } from '../../components/ui/Popover';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useDates } from '../../lib/useDates';
import { isValidCustomRange } from './params';

interface PeriodControlProps {
  value: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  /** Loading: shown but inert. */
  disabled?: boolean;
}

/**
 * This week / Last week / Last 4 weeks / Last month / This quarter / Custom (Reports.dc.html
 * period segmented; Last week and Last month added after the usability review). Custom
 * opens a small From / To popover under the control (not drawn; derived-UI rules).
 */
export function PeriodControl({ value, onChange, disabled }: PeriodControlProps) {
  const { t } = useTranslation();
  const { today } = useDates();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const id = useId();

  const openCustom = () => {
    setFrom(value.from ?? addDays(today, -27));
    setTo(value.to ?? today);
    setOpen(true);
  };
  const valid = from !== '' && to !== '' && isValidCustomRange(from, to);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('reports.period.customTitle')}
      width={264}
      elevation="lg"
      placement="bottom-end"
      // Only the Custom segment opens it, so the trigger takes the anchor ref alone.
      trigger={(props) => (
        <div ref={props.ref}>
          <SegmentedControl<ReportPeriod>
            label={t('reports.period.label')}
            size="toolbar"
            disabled={disabled}
            value={value.period}
            options={REPORT_PERIODS.map((p) => ({ value: p, label: t(`reports.period.${p}`) }))}
            onChange={(period) => {
              if (period === 'custom') openCustom();
              else onChange({ period, from: undefined, to: undefined });
            }}
            onClear={() => {
              if (value.period === 'custom') openCustom();
            }}
          />
        </div>
      )}
    >
      {(close) => (
        <form
          className="flex flex-col gap-3 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onChange({ period: 'custom', from, to });
            close();
          }}
        >
          <span className="text-[13px] font-semibold">{t('reports.period.customTitle')}</span>
          <div className="flex gap-2">
            <DateField
              id={`${id}-from`}
              label={t('reports.period.from')}
              value={from}
              onChange={setFrom}
            />
            <DateField id={`${id}-to`} label={t('reports.period.to')} value={to} onChange={setTo} />
          </div>
          {!valid && from !== '' && to !== '' && (
            <p role="alert" className="m-0 text-[12px] leading-4 text-danger">
              {t('reports.period.customInvalid')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              {t('reports.period.cancel')}
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!valid}>
              {t('reports.period.apply')}
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}
