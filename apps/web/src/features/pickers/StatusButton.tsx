import type { Status, TaskStatusRef } from '@kite/shared';
import { useState } from 'react';
import { useProject } from '../../api/projects';
import { StatusDot } from '../../components/ui/StatusDot';
import { cn } from '../../lib/cn';
import { StatusPicker } from './StatusPicker';

interface StatusButtonProps {
  status: TaskStatusRef;
  /** The task's project: its statuses load on first hover/focus/open unless `statuses` is set. */
  projectId: string;
  statuses?: readonly Status[] | null;
  label: string;
  onChange: (status: Status) => void;
  /** Just the marker (a row being created or dragged). */
  inert?: boolean;
}

/**
 * The status marker in place of the design's checkbox (List and My Tasks rows): a 28px ghost
 * button with a 16px marker that opens the project's statuses.
 */
export function StatusButton({
  status,
  projectId,
  statuses: given,
  label,
  onChange,
  inert,
}: StatusButtonProps) {
  const [wanted, setWanted] = useState(false);
  const project = useProject(!given && wanted ? projectId : undefined);

  if (inert) return <StatusDot category={status.category} size={16} label={label} />;
  const loaded = given ?? project.data?.statuses ?? null;
  const want = () => {
    setWanted(true);
  };
  return (
    <StatusPicker
      value={status.id}
      statuses={loaded ?? [status]}
      label={label}
      onOpenChange={(open) => {
        if (open) want();
      }}
      onChange={(picked) => {
        const full = loaded?.find((s) => s.id === picked.id);
        if (full) onChange(full);
      }}
      trigger={(props, open) => (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          {...props}
          onPointerEnter={want}
          onFocus={want}
          className={cn(
            'flex size-7 items-center justify-center rounded-[6px] border-0 bg-transparent p-0 hover:bg-hover',
            open && 'bg-hover',
          )}
        >
          <StatusDot category={status.category} size={16} />
        </button>
      )}
    />
  );
}
