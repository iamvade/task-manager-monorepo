import type { PersonReport, WorkspaceMember } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useWorkspaceMembers, useWsPath } from '../../../api/workspaces';
import { ChevronDownIcon, CommentIcon, LockIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Picker } from '../../../components/ui/Picker';
import { Popover } from '../../../components/ui/Popover';
import { filtersSearch } from '../params';
import { InsightBox } from '../ui/InsightBox';
import { useReportsRole } from '../useReportsRole';

/**
 * People header (ReportsPeople.dc.html): the person picker, the "Visible to admins only" chip,
 * the compared range on the right, and the 1:1 note under them.
 */
export function PersonPickerRow({
  person,
  compared,
}: {
  person: PersonReport['person'];
  /** "Sep 12 – Oct 9 · compared with the previous 4 weeks". */
  compared: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PersonPicker person={person} />
        <span className="inline-flex h-6 items-center gap-1.5 rounded-[6px] bg-surface-2 px-2 text-[12px] font-medium whitespace-nowrap text-3">
          <LockIcon size={12} />
          {t('reports.person.people.adminOnly')}
        </span>
        <span className="flex-1" />
        <span className="text-[13px] text-muted">{compared}</span>
      </div>
      <InsightBox
        tone="neutral"
        icon={<CommentIcon size={16} className="mt-0.5 flex-none text-3" />}
      >
        {t('reports.person.people.note')}
      </InsightBox>
    </div>
  );
}

/**
 * 52px button (36px avatar, name 16/22 600, job title 12/16 muted) opening a 280px listbox of the
 * workspace's members; picking one moves to `/reports/people/:userId`, keeping the period.
 */
function PersonPicker({ person }: { person: PersonReport['person'] }) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { workspace } = useReportsRole();
  const members = useWorkspaceMembers(workspace?.id).data ?? [];
  const label = t('reports.person.pickPerson');

  return (
    <Popover
      label={label}
      width={280}
      elevation="lg"
      placement="bottom-start"
      offset={6}
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${person.user.name}`}
          className="flex h-[52px] max-w-full items-center gap-3 rounded-[12px] border border-default bg-control pr-3 pl-2 text-left hover:bg-hover"
        >
          <Avatar user={person.user} size={36} textSize={13} title={null} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[16px] leading-[22px] font-semibold">
              {person.user.name}
            </span>
            {person.title && (
              <span className="truncate text-[12px] leading-4 text-muted">{person.title}</span>
            )}
          </span>
          <ChevronDownIcon size={14} className="ml-2 flex-none text-icon" />
        </button>
      )}
    >
      {(close) => (
        <Picker<WorkspaceMember>
          items={members}
          value={person.user.id}
          getKey={(m) => m.user.id}
          getLabel={(m) => m.user.name}
          label={label}
          tall
          onSelect={(m) => {
            void navigate(ws(`/reports/people/${m.user.id}${filtersSearch(params)}`));
          }}
          onClose={close}
          renderItem={(m) => (
            <>
              <Avatar user={m.user} size={24} title={null} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">{m.user.name}</span>
                {m.title && (
                  <span className="truncate text-[11px] leading-[14px] text-muted">{m.title}</span>
                )}
              </span>
            </>
          )}
        />
      )}
    </Popover>
  );
}
