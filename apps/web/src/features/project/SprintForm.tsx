import type { Sprint } from '@kite/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { useCreateSprint, useUpdateSprint } from '../../api/sprints';
import { useSidebar } from '../../api/workspaces';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { DateField } from '../../components/ui/DateField';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { nextSprintDates, sprintLabel } from '../../lib/sprint';
import { useDates } from '../../lib/useDates';

interface SprintFormProps {
  workspaceId: string;
  /** The workspace's sprints: the next number, and the prefilled dates follow the latest one. */
  sprints: readonly Sprint[];
  /** Edit this sprint; without it the form creates one. */
  sprint?: Sprint | undefined;
  /** New sprint: the project it starts with (more can be ticked). */
  projectId?: string | undefined;
  onDone: (sprint: Sprint) => void;
  onCancel: () => void;
  /** Id for the heading (a modal is labelled by it). */
  headingId?: string;
}

/**
 * Name (optional, "Sprint 15" placeholder), Start / End and the projects whose tasks can be in
 * it (not designed; derived-UI rules, like the Reports custom period). Used in Settings →
 * Sprints, the project menu's dialog and the drawer's sprint picker.
 */
export function SprintForm({
  workspaceId,
  sprints,
  sprint,
  projectId,
  onDone,
  onCancel,
  headingId,
}: SprintFormProps) {
  const { t } = useTranslation();
  const { today } = useDates();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [initial] = useState(
    () =>
      sprint ?? {
        ...nextSprintDates(
          projectId ? sprints.filter((s) => s.projectIds.includes(projectId)) : sprints,
          today,
        ),
      },
  );
  const [name, setName] = useState(sprint?.name ?? '');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [projectIds, setProjectIds] = useState<readonly string[]>(
    sprint?.projectIds ?? (projectId ? [projectId] : []),
  );
  const createSprint = useCreateSprint(workspaceId);
  const updateSprint = useUpdateSprint(workspaceId);
  const save = sprint ? updateSprint : createSprint;

  // The picker swaps its list for this form, so focus doesn't land here on its own.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const nextNumber = sprint?.number ?? sprints.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const complete = startDate !== '' && endDate !== '';
  const validRange = complete && endDate >= startDate;
  const valid = validRange && projectIds.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || save.isPending) return;
    const trimmed = name.trim();
    if (sprint) {
      updateSprint.mutate(
        {
          sprintId: sprint.id,
          name: trimmed || null,
          startDate,
          endDate,
          projectIds: [...projectIds],
        },
        { onSuccess: onDone },
      );
    } else {
      createSprint.mutate(
        { ...(trimmed ? { name: trimmed } : {}), startDate, endDate, projectIds: [...projectIds] },
        { onSuccess: onDone },
      );
    }
  }

  const error = save.error;
  const errorText =
    error instanceof ApiError && error.code === 'SPRINT_PROJECT_IN_USE'
      ? t('sprint.projectInUse')
      : t('common.genericError');

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-2">
      <h2 id={headingId} className="m-0 text-[13px] font-semibold">
        {sprint ? t('sprint.edit') : t('sprint.new')}
      </h2>
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
        {t('sprint.nameLabel')}
        <input
          ref={nameRef}
          value={name}
          maxLength={80}
          placeholder={sprintLabel(t, { name: null, number: nextNumber })}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="box-border h-8 rounded-[8px] border border-control bg-control px-2 text-[13px] font-normal text-default"
        />
      </label>
      <div className="flex gap-2">
        <DateField
          id={`${id}-start`}
          label={t('sprint.start')}
          value={startDate}
          onChange={setStartDate}
        />
        <DateField
          id={`${id}-end`}
          label={t('sprint.end')}
          value={endDate}
          min={startDate || undefined}
          onChange={setEndDate}
        />
      </div>
      {complete && !validRange && (
        <p role="alert" className="m-0 text-[12px] leading-4 text-danger">
          {t('sprint.invalidRange')}
        </p>
      )}
      <SprintProjectsField workspaceId={workspaceId} value={projectIds} onChange={setProjectIds} />
      {save.isError && (
        <p role="alert" className="m-0 text-[12px] leading-4 text-danger">
          {errorText}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!valid || save.isPending}>
          {sprint ? t('sprint.save') : t('sprint.create')}
        </Button>
      </div>
    </form>
  );
}

/** The workspace's projects by space, as checkboxes; ids it doesn't list (archived) are kept. */
function SprintProjectsField({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: readonly string[];
  onChange: (ids: readonly string[]) => void;
}) {
  const { t } = useTranslation();
  const spaces = useSidebar(workspaceId).data?.spaces ?? [];
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-[12px] font-medium text-muted">
        {t('sprint.projects')}
      </legend>
      <div className="max-h-[168px] overflow-y-auto rounded-[8px] border border-control px-2 py-1">
        {spaces
          .filter((space) => space.projects.length > 0)
          .map((space) => (
            <div key={space.id} className="py-0.5">
              {spaces.length > 1 && (
                <div className="truncate py-1 text-[11px] font-semibold text-muted">
                  {space.name}
                </div>
              )}
              {space.projects.map((p) => {
                const checked = value.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex h-7 cursor-pointer items-center gap-2 text-[13px] text-default"
                  >
                    <Checkbox
                      checked={checked}
                      label={p.name}
                      onChange={(next) => {
                        onChange(next ? [...value, p.id] : value.filter((x) => x !== p.id));
                      }}
                    />
                    <ProjectDot color={p.color} size={7} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-[12px] text-muted">{p.key}</span>
                  </label>
                );
              })}
            </div>
          ))}
      </div>
      {value.length === 0 && (
        <p className="m-0 text-[12px] leading-4 text-muted">{t('sprint.pickProject')}</p>
      )}
    </fieldset>
  );
}
