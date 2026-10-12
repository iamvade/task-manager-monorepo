import { WarningIcon } from '../../../components/icons';

/** "Stale" / "Replan" chip: 22px, radius 6, warning-soft, 12/600 with a 12px warning icon. */
export function WarnChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-[6px] bg-warning-soft px-2 text-[12px] font-semibold whitespace-nowrap text-warning-soft">
      <WarningIcon size={12} strokeWidth={2.25} />
      {label}
    </span>
  );
}
