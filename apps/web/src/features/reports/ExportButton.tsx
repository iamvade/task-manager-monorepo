import { DownloadIcon } from '../../components/icons';
import { cn } from '../../lib/cn';

const base =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium whitespace-nowrap';

/** Ghost "⬇ Export CSV" link; disabled = faint, not-allowed (loading and empty states). */
export function ExportButton({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <button type="button" disabled className={cn(base, 'cursor-not-allowed text-faint')}>
        <DownloadIcon size={14} />
        {label}
      </button>
    );
  }
  return (
    <a href={href} download className={cn(base, 'text-2 hover:bg-hover')}>
      <DownloadIcon size={14} />
      {label}
    </a>
  );
}

/** 1px × 20 divider between the filters and Export. */
export function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border)]" />;
}
