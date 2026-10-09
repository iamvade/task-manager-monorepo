import type { UserRef, WorkspaceMember } from '@kite/shared';
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';

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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open,
  onOpenChange,
}: AssigneePickerProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const meId = me?.user.id;

  const sorted = useMemo(() => {
    const rank = (m: WorkspaceMember) => (m.user.id === meId ? 0 : teamIds?.has(m.user.id) ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
  }, [members, meId, teamIds]);
  const items: Item[] = single ? [...sorted, null] : sorted;
  const grouped = Boolean(teamIds?.size) && sorted.some((m) => !teamIds?.has(m.user.id));
  const selected = value.map((u) => u.id);

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
      onOpenChange={onOpenChange}
    >
      {(close) => (
        <Picker<Item>
          items={items}
          value={single && selected.length === 0 ? NONE : selected}
          multiple={!single}
          getKey={(m) => m?.user.id ?? NONE}
          getLabel={(m) => m?.user.name ?? t('create.unassigned')}
          label={t('picker.assigneeLabel')}
          search={{ placeholder: t('create.assignTo') }}
          groupBy={
            grouped
              ? (m) =>
                  m && (m.user.id === meId || teamIds?.has(m.user.id))
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
          renderItem={(m) =>
            m ? (
              <>
                <Avatar user={m.user} size={20} title={null} />
                <span className="flex-1 truncate">{m.user.name}</span>
                <span className="text-[12px] text-muted">
                  {m.user.id === meId ? t('create.you') : m.title}
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
                <span className="flex-1 truncate text-muted">{t('create.unassigned')}</span>
              </>
            )
          }
        />
      )}
    </Popover>
  );
}
