import { matchesName, type UserRef, type WorkspaceMember } from '@kite/shared';
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { cn } from '../../lib/cn';
import { useMemberHint } from './useMemberHint';

interface AssigneePickerProps {
  value: readonly UserRef[];
  members: readonly WorkspaceMember[];
  /** The project's team: listed first (suggested assignees). */
  teamIds?: ReadonlySet<string>;
  onChange: (users: UserRef[]) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  /** Accessible name of the popover. */
  label: string;
  /**
   * One assignee (quick create): picking replaces and closes, and an "Unassigned" row closes
   * the list.
   */
  single?: boolean;
  /** Label of the empty row in single mode ("Unassigned" by default). */
  noneLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wording for other uses (standup "Who can help"): the search field and the picked group. */
  searchPlaceholder?: string;
  pickedLabel?: string;
}

const toRef = ({ id, name, initials, avatarColor }: UserRef): UserRef => ({
  id,
  name,
  initials,
  avatarColor,
});

/** `null` = the "Unassigned" row (single mode). */
type Item = WorkspaceMember | null;
const NONE = 'unassigned';

/**
 * People picker (CreateTask.dc.html assignee popover, 264px): search, 20px avatars, "You" /
 * job title hint, ✓ on assigned. ⌫ on an empty search unassigns everyone.
 */
export function AssigneePicker({
  value,
  members,
  teamIds,
  onChange,
  trigger,
  label,
  single = false,
  noneLabel,
  open,
  onOpenChange,
  searchPlaceholder,
  pickedLabel,
}: AssigneePickerProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const meId = me?.user.id;
  const hintOf = useMemberHint();
  const none = noneLabel ?? t('create.unassigned');

  const selected = value.map((u) => u.id);
  // Multi-select: who was assigned when the list opened sits on top ("Assigned"), so removing
  // someone is as easy as adding; it doesn't reorder while you click.
  const [assignedAtOpen, setAssignedAtOpen] = useState<ReadonlySet<string>>(new Set());
  const pinned = useMemo(
    () => (single ? new Set<string>() : assignedAtOpen),
    [single, assignedAtOpen],
  );
  const sorted = useMemo(() => {
    const rank = (m: WorkspaceMember) =>
      pinned.has(m.user.id) ? -1 : m.user.id === meId ? 0 : teamIds?.has(m.user.id) ? 1 : 2;
    return [...members].sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
  }, [members, meId, teamIds, pinned]);
  const items: Item[] = single ? [...sorted, null] : sorted;
  const grouped =
    pinned.size > 0 || (Boolean(teamIds?.size) && sorted.some((m) => !teamIds?.has(m.user.id)));

  function pick(item: Item) {
    if (item === null) {
      onChange([]);
      return;
    }
    if (single) {
      onChange([toRef(item.user)]);
      return;
    }
    const on = selected.includes(item.user.id);
    onChange(
      on ? value.filter((u) => u.id !== item.user.id) : [...value.map(toRef), toRef(item.user)],
    );
  }

  return (
    <Popover
      trigger={trigger}
      label={label}
      width={264}
      elevation="lg"
      open={open}
      onOpenChange={(next) => {
        if (next) setAssignedAtOpen(new Set(selected));
        onOpenChange?.(next);
      }}
    >
      {(close) => (
        <Picker<Item>
          items={items}
          value={single && selected.length === 0 ? NONE : selected}
          multiple={!single}
          getKey={(m) => m?.user.id ?? NONE}
          getLabel={(m) => m?.user.name ?? none}
          label={t('picker.assigneeLabel')}
          search={{
            placeholder: searchPlaceholder ?? t('create.assignTo'),
            // Across scripts: "Bat" finds Бат-Эрдэнэ, "Цогт" finds Tsogt.
            filter: (m, q) => matchesName(m?.user.name ?? none, q),
          }}
          groupBy={
            grouped
              ? (m) =>
                  m && pinned.has(m.user.id)
                    ? (pickedLabel ?? t('picker.assigned'))
                    : m && (m.user.id === meId || teamIds?.has(m.user.id))
                      ? t('picker.projectTeam')
                      : t('picker.others')
              : undefined
          }
          onSelect={pick}
          onClear={() => {
            onChange([]);
          }}
          onClose={close}
          footerHints
          renderItem={(m, { selected }) =>
            m ? (
              <>
                <Avatar user={m.user} size={20} title={null} />
                <span className="flex-1 truncate">{m.user.name}</span>
                {/* Muted fails contrast on the accent-soft selected row in dark mode. */}
                <span className={cn('text-[12px]', selected ? 'text-2' : 'text-muted')}>
                  {hintOf(m)}
                </span>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="box-border flex size-5 flex-none items-center justify-center rounded-full border border-dashed border-strong bg-surface-2 text-[9px] font-semibold text-muted"
                >
                  –
                </span>
                <span className="flex-1 truncate text-muted">{none}</span>
              </>
            )
          }
        />
      )}
    </Popover>
  );
}
