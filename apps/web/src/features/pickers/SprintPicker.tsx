import type { ProjectDetail, Sprint } from '@kite/shared';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '../../components/icons';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { sprintLabel } from '../../lib/sprint';
import { useDates } from '../../lib/useDates';
import { useSprints } from '../../api/sprints';
import { SprintForm } from '../project/SprintForm';

interface SprintPickerProps {
  value: string | null;
  sprints: readonly Sprint[];
  onChange: (sprintId: string | null) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  label: string;
  /** Shows "+ New sprint" (covering this project) under the list; the created sprint is picked. */
  project?: Pick<ProjectDetail, 'id' | 'workspaceId'> | undefined;
}

const NONE = 'none';

/**
 * The sprints covering the task's project (name + date range) and "No sprint". ⌫ clears. "+ New sprint" swaps the
 * list for the sprint form in the same popover (not designed).
 */
export function SprintPicker({
  value,
  sprints,
  onChange,
  trigger,
  label,
  project,
}: SprintPickerProps) {
  const { t } = useTranslation();
  const dates = useDates();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const allSprints = useSprints(creating ? project?.workspaceId : undefined).data;
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const backFromForm = useRef(false);
  const items = [...sprints.map((s) => ({ id: s.id, sprint: s })), { id: NONE, sprint: null }];

  // Cancel in the form returns to the list with focus on "+ New sprint".
  useEffect(() => {
    if (creating || !backFromForm.current) return;
    backFromForm.current = false;
    newButtonRef.current?.focus();
  }, [creating]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
      trigger={trigger}
      label={creating ? t('sprint.new') : label}
      width={creating ? 300 : 264}
      elevation="lg"
    >
      {(close) =>
        creating && project && allSprints ? (
          <SprintForm
            workspaceId={project.workspaceId}
            projectId={project.id}
            sprints={allSprints}
            onDone={(sprint) => {
              onChange(sprint.id);
              close();
            }}
            onCancel={() => {
              backFromForm.current = true;
              setCreating(false);
            }}
          />
        ) : (
          <>
            <Picker
              items={items}
              value={value ?? NONE}
              getKey={(i) => i.id}
              getLabel={(i) => (i.sprint ? sprintLabel(t, i.sprint) : t('drawer.noSprint'))}
              label={label}
              onSelect={(i) => {
                onChange(i.sprint?.id ?? null);
              }}
              onClear={() => {
                onChange(null);
              }}
              onClose={close}
              renderItem={(i) => (
                <>
                  <span className="flex-1 truncate">
                    {i.sprint ? sprintLabel(t, i.sprint) : t('drawer.noSprint')}
                  </span>
                  {i.sprint && (
                    <span className="text-[12px] text-muted">
                      {dates.formatRange(i.sprint.startDate, i.sprint.endDate)}
                    </span>
                  )}
                </>
              )}
            />
            {project && (
              <div className="-mx-1 mt-1 border-t border-subtle px-1 pt-1">
                <button
                  ref={newButtonRef}
                  type="button"
                  onClick={() => {
                    setCreating(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-[13px] text-2 hover:bg-popover-hover"
                >
                  <PlusIcon size={14} className="text-icon" />
                  {t('sprint.new')}
                </button>
              </div>
            )}
          </>
        )
      }
    </Popover>
  );
}
