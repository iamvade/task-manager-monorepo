import { cn } from '../../lib/cn';
import { DUE_TONE_CLASS } from '../../lib/dates';
import { useDates } from '../../lib/useDates';

interface DueDateProps {
  date: string;
  done?: boolean;
  className?: string;
}

/** "Today" / "Tomorrow" / "Oct 14", colored by tone (overdue · today · soon · later · done). */
export function DueDate({ date, done, className }: DueDateProps) {
  const dates = useDates();
  return (
    <span
      className={cn(
        'text-[13px] whitespace-nowrap',
        DUE_TONE_CLASS[dates.dueTone(date, done)],
        className,
      )}
    >
      {dates.formatDue(date)}
    </span>
  );
}
