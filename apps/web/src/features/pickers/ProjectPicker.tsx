import type { SidebarSpace } from '@kite/shared';
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { ProjectDot } from '../../components/ui/ProjectDot';

interface ProjectPickerProps {
  spaces: readonly SidebarSpace[];
  /** Current project: marked ✓ and not selectable again. */
  value: string | null;
  onChange: (project: SidebarSpace['projects'][number]) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
  /** Controlled open state (the drawer's "Move to project…" menu item opens it). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Projects grouped by space (dot, name, space), as in CreateTask.dc.html's project picker. */
export function ProjectPicker({
  spaces,
  value,
  onChange,
  trigger,
  label,
  open,
  onOpenChange,
}: ProjectPickerProps) {
  const { t } = useTranslation();
  const items = useMemo(
    () => spaces.flatMap((space) => space.projects.map((project) => ({ project, space }))),
    [spaces],
  );
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
        <Picker
          items={items}
          value={value}
          getKey={(i) => i.project.id}
          getLabel={(i) => i.project.name}
          label={label}
          search={{ placeholder: t('create.moveToProject') }}
          groupBy={(i) => i.space.name}
          onSelect={(i) => {
            if (i.project.id !== value) onChange(i.project);
          }}
          onClose={close}
          renderItem={(i) => (
            <>
              <ProjectDot color={i.project.color} size={8} />
              <span className="flex-1 truncate">{i.project.name}</span>
              <span className="font-mono text-[12px] text-muted">{i.project.key}</span>
            </>
          )}
        />
      )}
    </Popover>
  );
}
