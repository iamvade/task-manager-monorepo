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
}

const toRef = ({ id, name, initials, avatarColor }: UserRef): UserRef => ({
  id,
  name,
  initials,
  avatarColor,
});

/**
 * Multi-select people picker (CreateTask.dc.html assignee popover, 264px): search, 20px
 * avatars, "You" / job title hint, ✓ on assigned. ⌫ on an empty search unassigns everyone.
 */
export function AssigneePicker({
  value,
  members,
  teamIds,
  onChange,
  trigger,
  label,
}: AssigneePickerProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const meId = me?.user.id;

  const items = useMemo(() => {
    const rank = (m: WorkspaceMember) => (m.user.id === meId ? 0 : teamIds?.has(m.user.id) ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
  }, [members, meId, teamIds]);
  const grouped = Boolean(teamIds?.size) && items.some((m) => !teamIds?.has(m.user.id));
  const selected = value.map((u) => u.id);

  function toggle(member: WorkspaceMember) {
    const on = selected.includes(member.user.id);
    onChange(
      on ? value.filter((u) => u.id !== member.user.id) : [...value.map(toRef), toRef(member.user)],
    );
  }

  return (
    <Popover trigger={trigger} label={label} width={264} elevation="lg">
      {(close) => (
        <Picker
          items={items}
          value={selected}
          multiple
          getKey={(m) => m.user.id}
          getLabel={(m) => m.user.name}
          label={t('picker.assigneeLabel')}
          search={{ placeholder: t('create.assignTo') }}
          groupBy={
            grouped
              ? (m) =>
                  m.user.id === meId || teamIds?.has(m.user.id)
                    ? t('picker.projectTeam')
                    : t('picker.others')
              : undefined
          }
          onSelect={toggle}
          onClear={() => {
            onChange([]);
          }}
          onClose={close}
          footerHints
          renderItem={(m) => (
            <>
              <Avatar user={m.user} size={20} title={null} />
              <span className="flex-1 truncate">{m.user.name}</span>
              <span className="text-[12px] text-muted">
                {m.user.id === meId ? t('create.you') : m.title}
              </span>
            </>
          )}
        />
      )}
    </Popover>
  );
}
