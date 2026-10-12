import type { ProjectDetail, Sprint } from '@kite/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateSprint } from '../../api/projects';
import { Button } from '../../components/ui/Button';
import { DateField } from '../../components/ui/DateField';
import { nextSprintDates, sprintLabel } from '../../lib/sprint';
import { useDates } from '../../lib/useDates';

interface NewSprintFormProps {
  project: Pick<ProjectDetail, 'id' | 'workspaceId'>;
  /** The project's sprints: the next number and the prefilled dates follow the latest one. */
  sprints: readonly Sprint[];
  onCreated: (sprint: Sprint) => void;
  onCancel: () => void;
  /** Id for the "New sprint" heading (the modal is labelled by it). */
  headingId?: string;
}

/**
 * Name (optional, "Sprint 15" placeholder) + Start / End (not designed; derived-UI rules, like
 * the Reports custom period). Used in the project menu's dialog and the drawer's sprint picker.
 */
export function NewSprintForm({
  project,
  sprints,
  onCreated,
  onCancel,
  headingId,
}: NewSprintFormProps) {
  const { t } = useTranslation();
  const { today } = useDates();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [initial] = useState(() => nextSprintDates(sprints, today));
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const createSprint = useCreateSprint(project);

  // The picker swaps its list for this form, so focus doesn't land here on its own.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const nextNumber = sprints.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const complete = startDate !== '' && endDate !== '';
  const valid = complete && endDate >= startDate;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || createSprint.isPending) return;
    const trimmed = name.trim();
    createSprint.mutate(
      { ...(trimmed ? { name: trimmed } : {}), startDate, endDate },
      { onSuccess: onCreated },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-2">
      <h2 id={headingId} className="m-0 text-[13px] font-semibold">
        {t('sprint.new')}
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
      {complete && !valid && (
        <p role="alert" className="m-0 text-[12px] leading-4 text-danger">
          {t('sprint.invalidRange')}
        </p>
      )}
      {createSprint.isError && (
        <p role="alert" className="m-0 text-[12px] leading-4 text-danger">
          {t('common.genericError')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          disabled={!valid || createSprint.isPending}
        >
          {t('sprint.create')}
        </Button>
      </div>
    </form>
  );
}
