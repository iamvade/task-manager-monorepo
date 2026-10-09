import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, PlusIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { CountBadge } from '../../components/ui/CountBadge';
import { IconButton } from '../../components/ui/IconButton';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { StatusDot } from '../../components/ui/StatusDot';
import type { GroupMarker } from './grouping';

interface GroupHeaderProps {
  label: string;
  count: number;
  marker: GroupMarker;
  open: boolean;
  onToggle: () => void;
  /** Header "+" (opens the quick-create modal with the group's fields). */
  onAdd?: () => void;
  /** Id of the group body, for aria-controls. */
  bodyId: string;
}

function Marker({ marker }: { marker: GroupMarker }) {
  switch (marker.kind) {
    case 'status':
      return <StatusDot category={marker.category} />;
    case 'user':
      return <Avatar user={marker.user} size={20} title={null} />;
    case 'unassigned':
      return (
        <span
          aria-hidden="true"
          className="box-border size-5 flex-none rounded-full border border-dashed border-strong bg-surface-2"
        />
      );
    case 'priority':
      return <PriorityFlag priority={marker.priority} />;
    case 'none':
      return null;
  }
}

/**
 * 40px group header (Main.dc.html): ghost toggle with a 14px chevron (90° when open), marker,
 * 14/600 label, count badge; then the always-visible 28px "+".
 */
export function GroupHeader({
  label,
  count,
  marker,
  open,
  onToggle,
  onAdd,
  bodyId,
}: GroupHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-10 items-center gap-2 px-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex h-8 items-center gap-2 rounded-[6px] border-0 bg-transparent pr-2 pl-1 text-default hover:bg-hover"
      >
        <ChevronRightIcon
          size={14}
          className="text-icon transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <Marker marker={marker} />
        <span className="text-[14px] font-semibold">{label}</span>
        <CountBadge value={count} />
      </button>
      {onAdd && (
        <IconButton
          label={t('table.addToGroup', { group: label })}
          size={28}
          onClick={onAdd}
          icon={<PlusIcon size={14} className="text-icon" />}
        />
      )}
    </div>
  );
}
