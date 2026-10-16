import type { Absence } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAbsences,
  useCreateAbsence,
  useDeleteAbsence,
  useUpdateAbsence,
} from '../../api/absences';
import { ApiError } from '../../api/client';
import { PencilIcon, TrashIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { DateField } from '../../components/ui/DateField';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { settingsInput } from './SettingsRow';

interface Draft {
  startDate: string;
  endDate: string;
  note: string;
}

/**
 * Someone's out-of-office periods (current and upcoming) with add / edit / delete. Used for
 * yourself in Settings → Profile and by admins for anyone in Settings → Members.
 */
export function AbsenceList({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { t } = useTranslation();
  const dates = useDates();
  const absences = useAbsences(workspaceId, userId);
  const create = useCreateAbsence(workspaceId, userId);
  const remove = useDeleteAbsence(workspaceId);
  const [editing, setEditing] = useState<string | null>(null);

  if (absences.isPending) return <Skeleton height={32} />;
  const list = absences.data ?? [];
  const range = (a: Pick<Absence, 'startDate' | 'endDate'>) =>
    a.startDate === a.endDate
      ? dates.formatDate(a.startDate)
      : dates.formatRange(a.startDate, a.endDate);

  return (
    <div className="flex w-full flex-col gap-3">
      {list.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('members.away.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 pl-0">
          {list.map((a) =>
            editing === a.id ? (
              <li key={a.id}>
                <AbsenceForm
                  workspaceId={workspaceId}
                  absence={a}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={a.id}
                className="flex min-h-9 items-center gap-2 rounded-[8px] border border-default px-3 text-[13px]"
              >
                <span className="font-medium text-default">{range(a)}</span>
                {a.note && <span className="min-w-0 flex-1 truncate text-muted">{a.note}</span>}
                <span className="ml-auto flex gap-1">
                  <IconButton
                    label={t('members.away.editOf', { range: range(a) })}
                    size={28}
                    icon={<PencilIcon size={14} />}
                    onClick={() => {
                      setEditing(a.id);
                    }}
                  />
                  <IconButton
                    label={t('members.away.deleteOf', { range: range(a) })}
                    size={28}
                    icon={<TrashIcon size={14} />}
                    onClick={() => {
                      remove.mutate(a.id, {
                        onSuccess: () => {
                          toast({
                            message: t('members.away.deleted', { range: range(a) }),
                            action: {
                              label: t('common.undo'),
                              onClick: () => {
                                create.mutate({
                                  startDate: a.startDate,
                                  endDate: a.endDate,
                                  note: a.note,
                                });
                              },
                            },
                          });
                        },
                      });
                    }}
                  />
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === null && <AbsenceForm workspaceId={workspaceId} userId={userId} />}
    </div>
  );
}

/** Add (with `userId`) or edit (with `absence`) one period. */
function AbsenceForm({
  workspaceId,
  userId,
  absence,
  onDone,
}: {
  workspaceId: string;
  userId?: string;
  absence?: Absence;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const { today } = useDates();
  const id = useId();
  const create = useCreateAbsence(workspaceId, userId ?? absence?.userId ?? '');
  const update = useUpdateAbsence(workspaceId);
  const empty: Draft = { startDate: today, endDate: '', note: '' };
  const [draft, setDraft] = useState<Draft>(
    absence
      ? { startDate: absence.startDate, endDate: absence.endDate, note: absence.note ?? '' }
      : empty,
  );
  const [error, setError] = useState<string | null>(null);
  const valid = draft.startDate !== '' && draft.endDate !== '' && draft.endDate >= draft.startDate;
  const pending = create.isPending || update.isPending;
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const onError = (err: Error) => {
    setError(
      err instanceof ApiError && err.code === 'ABSENCE_OVERLAP'
        ? t('members.away.overlap')
        : t('common.genericError'),
    );
  };

  return (
    <form
      aria-label={absence ? t('members.away.edit') : t('members.away.add')}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const body = { ...draft, note: draft.note.trim() || null };
        if (absence) {
          update.mutate({ id: absence.id, ...body }, { onSuccess: () => onDone?.(), onError });
        } else {
          create.mutate(body, {
            onSuccess: () => {
              setDraft(empty);
            },
            onError,
          });
        }
      }}
    >
      <DateField
        id={`${id}-from`}
        label={t('members.away.from')}
        value={draft.startDate}
        onChange={(startDate) => {
          set({ startDate });
        }}
      />
      <DateField
        id={`${id}-until`}
        label={t('members.away.until')}
        value={draft.endDate}
        min={draft.startDate || undefined}
        onChange={(endDate) => {
          set({ endDate });
        }}
      />
      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[12px] font-medium text-muted">
        {t('members.away.note')}
        <input
          value={draft.note}
          maxLength={80}
          placeholder={t('members.away.notePlaceholder')}
          onChange={(e) => {
            set({ note: e.target.value });
          }}
          className={settingsInput}
        />
      </label>
      <Button type="submit" disabled={!valid || pending}>
        {absence ? t('members.away.save') : t('members.away.addButton')}
      </Button>
      {absence && (
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      )}
      {error && (
        <p role="alert" className="m-0 w-full text-[12px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
