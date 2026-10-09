import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'accent' | 'accentSoft' | 'danger';

const TONES: Record<Tone, string> = {
  // Group headers: 20px, 12/500, chip colors.
  neutral: 'h-5 min-w-5 rounded-[10px] bg-chip text-[12px] font-medium text-chip',
  // Sidebar Inbox: 18px accent pill, white 11/600.
  accent: 'h-[18px] min-w-5 rounded-[9px] bg-accent text-[11px] font-semibold text-white',
  // Filter button: accent-soft pill, accent-ink 11/600.
  accentSoft: 'h-[18px] rounded-[9px] bg-accent-soft text-[11px] font-semibold text-accent-ink',
  danger: 'h-5 min-w-5 rounded-[10px] bg-danger-soft text-[12px] font-medium text-danger-soft',
};

interface CountBadgeProps {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}

export function CountBadge({ value, tone = 'neutral', className, label }: CountBadgeProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        'box-border flex flex-none items-center justify-center px-1.5',
        TONES[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}
