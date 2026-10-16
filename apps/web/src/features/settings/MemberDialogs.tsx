import type { UserRef, WorkspaceMember } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMemberHandover, useSetMemberActive } from '../../api/workspaces';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/toast';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { AbsenceList } from './AbsenceList';

/**
 * Settings → Members "Deactivate…" (not designed): what the leaver hands over (open tasks,
 * reviews, projects they lead), one optional successor, and the danger confirm. The successor
 * takes their open tasks, reviews and lead roles; without one they're just removed from them.
 */
export function DeactivateDialog({
  workspaceId,
  member,
  members,
  onClose,
}: {
  workspaceId: string;
  /** Null = closed. */
  member: WorkspaceMember | null;
  members: readonly WorkspaceMember[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const handover = useMemberHandover(workspaceId, member?.user.id ?? null);
  const setActive = useSetMemberActive(workspaceId);
  const [successor, setSuccessor] = useState<UserRef | null>(null);
  const others = members.filter((m) => m.user.id !== member?.user.id);
  const name = member?.user.name ?? '';

  const close = () => {
    setSuccessor(null);
    onClose();
  };

  return (
    <Modal open={member !== null} onClose={close} labelledBy={headingId} width={480}>
      <div className="flex flex-col gap-4 p-5">
        <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
          {t('members.deactivate.title', { name })}
        </h2>
        <p className="m-0 text-[13px] text-3">{t('members.deactivate.intro')}</p>
        {!handover.data ? (
          <Skeleton height={60} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 pl-0 text-[13px] text-2">
            <li>{t('members.deactivate.openTasks', { count: handover.data.openTasks })}</li>
            <li>{t('members.deactivate.reviewing', { count: handover.data.reviewing })}</li>
            <li>
              {handover.data.leadOf.length === 0
                ? t('members.deactivate.leadsNone')
                : t('members.deactivate.leads', {
                    count: handover.data.leadOf.length,
                    projects: handover.data.leadOf.map((p) => p.name).join(', '),
                  })}
            </li>
          </ul>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-2">{t('members.deactivate.handTo')}</span>
          <AssigneePicker
            single
            value={successor ? [successor] : []}
            members={others}
            noneLabel={t('members.deactivate.nobody')}
            label={t('members.deactivate.handTo')}
            onChange={([user]) => {
              setSuccessor(user ?? null);
            }}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={`${t('members.deactivate.handTo')}: ${successor?.name ?? t('members.deactivate.nobody')}`}
                className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-control bg-control px-2.5 text-left text-[13px] hover:bg-hover"
              >
                {successor ? (
                  <>
                    <Avatar user={successor} size={20} title={null} />
                    <span className="truncate">{successor.name}</span>
                  </>
                ) : (
                  <span className="text-muted">{t('members.deactivate.nobody')}</span>
                )}
              </button>
            )}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close} disabled={setActive.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!member || setActive.isPending}
            aria-busy={setActive.isPending}
            onClick={() => {
              if (!member) return;
              setActive.mutate(
                { userId: member.user.id, active: false, reassignTo: successor?.id ?? null },
                {
                  onSuccess: () => {
                    toast({ message: t('members.deactivate.done', { name }) });
                    close();
                  },
                },
              );
            }}
          >
            {t('members.deactivate.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Admins' "Set out of office…" for someone else: their absences. */
export function AwayDialog({
  workspaceId,
  member,
  onClose,
}: {
  workspaceId: string;
  member: WorkspaceMember | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <Modal open={member !== null} onClose={onClose} labelledBy={headingId} width={640}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
            {t('members.away.titleOf', { name: member?.user.name ?? '' })}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
        {member && (
          <AbsenceList key={member.user.id} workspaceId={workspaceId} userId={member.user.id} />
        )}
      </div>
    </Modal>
  );
}
