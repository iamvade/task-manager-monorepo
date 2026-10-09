import { X } from 'lucide-react';
import { IconButton } from './IconButton';

interface FilterChipProps {
  /** Muted lead-in, e.g. "Sprint is". */
  label: string;
  value: string;
  onRemove: () => void;
  removeLabel: string;
}

/** Removable active-filter pill: 26px, round, outlined, 12px. */
export function FilterChip({ label, value, onRemove, removeLabel }: FilterChipProps) {
  return (
    <span className="flex h-[26px] items-center gap-1.5 rounded-[13px] border border-control pr-1 pl-2.5 text-[12px] text-2">
      <span className="text-muted">{label}</span> {value}
      <IconButton
        label={removeLabel}
        size={20}
        radius={10}
        onClick={onRemove}
        icon={<X size={12} strokeWidth={2.5} className="text-icon" aria-hidden="true" />}
      />
    </span>
  );
}
