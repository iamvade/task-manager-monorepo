import {
  SECONDS_PER_PERSON,
  SPEAKING_ORDERS,
  STANDUP_TIMES,
  standupTimesInOrder,
  zonedTimeToZone,
  type SpeakingOrder,
  type StandupGroup,
  type UpdateStandupGroup,
  type UserRef,
  type WorkspaceMember,
} from '@kite/shared';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useArchiveStandupGroup, useStandupGroup, useUpdateStandupGroup } from '../../api/standups';
import { useCurrentWorkspace, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import {
  ArchiveIcon,
  ChevronRightIcon,
  CloseIcon,
  MoreIcon,
  PlusIcon,
} from '../../components/icons';
import { TimezonePicker } from '../../components/TimezonePicker';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { toast } from '../../stores/toast';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { WEEKDAY_KEYS, zoneLabel } from './format';

/** What the form edits; saved in one PATCH. */
interface Draft {
  name: string;
  days: number[];
  postBy: string;
  reminderAt: string | null;
  meetingAt: string | null;
  timezone: string;
  secondsPerPerson: number;
  speakingOrder: SpeakingOrder;
  showBlockersFirst: boolean;
  markLinkedTasksBlocked: boolean;
  members: UserRef[];
  facilitatorId: string | null;
}

const draftOf = (g: StandupGroup): Draft => ({
  name: g.name,
  days: [...g.days].sort((a, b) => a - b),
  postBy: g.postBy,
  reminderAt: g.reminderAt,
  meetingAt: g.meetingAt,
  timezone: g.timezone,
  secondsPerPerson: g.secondsPerPerson,
  speakingOrder: g.speakingOrder,
  showBlockersFirst: g.showBlockersFirst,
  markLinkedTasksBlocked: g.markLinkedTasksBlocked,
  members: g.members.map((m) => m.user),
  facilitatorId: g.facilitatorId,
});

/** Only what changed, so a teammate's concurrent edit to another field survives. */
function patchOf(before: Draft, after: Draft): UpdateStandupGroup {
  const patch: UpdateStandupGroup = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (after.name.trim() !== before.name) patch.name = after.name.trim();
  if (!same(before.days, after.days)) patch.days = after.days;
  if (after.postBy !== before.postBy) patch.postBy = after.postBy;
  if (after.reminderAt !== before.reminderAt) patch.reminderAt = after.reminderAt;
  if (after.meetingAt !== before.meetingAt) patch.meetingAt = after.meetingAt;
  if (after.timezone !== before.timezone) patch.timezone = after.timezone;
  if (after.secondsPerPerson !== before.secondsPerPerson) {
    patch.secondsPerPerson = after.secondsPerPerson as 60 | 120 | 180;
  }
  if (after.speakingOrder !== before.speakingOrder) patch.speakingOrder = after.speakingOrder;
  if (after.showBlockersFirst !== before.showBlockersFirst) {
    patch.showBlockersFirst = after.showBlockersFirst;
  }
  if (after.markLinkedTasksBlocked !== before.markLinkedTasksBlocked) {
    patch.markLinkedTasksBlocked = after.markLinkedTasksBlocked;
  }
  const ids = (d: Draft) => d.members.map((m) => m.id);
  if (!same(ids(before), ids(after))) patch.memberIds = ids(after);
  if (after.facilitatorId !== before.facilitatorId) patch.facilitatorId = after.facilitatorId;
  return patch;
}

/** `/standup/:groupId/settings` (StandupSettings.dc.html). */
export function StandupSettingsPage() {
  const { groupId } = useParams();
  const workspace = useCurrentWorkspace();
  const group = useStandupGroup(groupId);
  const members = useWorkspaceMembers(workspace?.id);
  if (group.isPending || members.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4 px-6 py-5">
        <Skeleton width={240} height={20} />
        <Skeleton height={38} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (group.isError) return <ErrorState error={group.error} />;
  if (members.isError) return <ErrorState error={members.error} />;
  return <SettingsForm key={group.data.id} group={group.data} workspaceMembers={members.data} />;
}

const sectionClass =
  'grid grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-6 border-b border-subtle py-6 last:border-b-0 max-sm:grid-cols-1';
const labelClass = 'text-[13px] font-medium';
const selectClass =
  'box-border h-[38px] w-full rounded-[8px] border border-default bg-surface px-2.5 text-[14px] text-default disabled:opacity-60';

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-h`} className={sectionClass}>
      <div>
        <h2 id={`${id}-h`} className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
        <p className="mt-1 mb-0 text-[13px] text-muted">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-[18px]">{children}</div>
    </section>
  );
}

function SettingsForm({
  group,
  workspaceMembers,
}: {
  group: StandupGroup;
  workspaceMembers: readonly WorkspaceMember[];
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { me } = useAuth();
  const id = useId();
  const initial = useMemo(() => draftOf(group), [group]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const update = useUpdateStandupGroup(group.id);
  const archive = useArchiveStandupGroup();
  const addRef = useRef<HTMLButtonElement | null>(null);
  const readOnly = !group.canEdit;
  const back = `/standup/${group.id}`;

  // "Invite members" on the empty state lands on #members: focus the add row.
  useEffect(() => {
    if (location.hash === '#members' && !readOnly) addRef.current?.focus();
  }, [location.hash, readOnly]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };
  const errors = {
    name: draft.name.trim() === '' ? t('standup.settings.nameRequired') : null,
    days: draft.days.length === 0 ? t('standup.settings.noDays') : null,
    times: standupTimesInOrder(draft) ? null : t('standup.settings.timeOrder'),
  };
  const valid = !errors.name && !errors.days && !errors.times;
  const patch = patchOf(initial, draft);
  const dirty = Object.keys(patch).length > 0;

  function save() {
    setShowErrors(true);
    if (!valid || readOnly) return;
    if (!dirty) {
      void navigate(back);
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast({ message: t('standup.settings.saved') });
        void navigate(back);
      },
      onError: () => {
        toast({ message: t('common.genericError') });
      },
    });
  }

  function onArchive() {
    archive.mutate(
      { groupId: group.id, archived: true },
      {
        onSuccess: () => {
          toast({
            message: t('standup.settings.archived', { name: group.name }),
            action: {
              label: t('common.undo'),
              onClick: () => {
                archive.mutate({ groupId: group.id, archived: false });
              },
            },
          });
          void navigate('/standup');
        },
      },
    );
  }

  const viewerZone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const local = (time: string) =>
    zonedTimeToZone(group.today, time, draft.timezone, viewerZone).time;
  const yourTimes =
    viewerZone !== draft.timezone
      ? [
          t('standup.settings.yourPostBy', { time: local(draft.postBy) }),
          draft.reminderAt && t('standup.settings.yourReminder', { time: local(draft.reminderAt) }),
          draft.meetingAt && t('standup.settings.yourMeeting', { time: local(draft.meetingAt) }),
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const memberIds = new Set(draft.members.map((m) => m.id));
  const titleOf = new Map(workspaceMembers.map((m) => [m.user.id, m.title]));
  const timeOptions = (value: string | null) =>
    // A stored off-step value (older data) stays selectable.
    value && !STANDUP_TIMES.includes(value) ? [value, ...STANDUP_TIMES] : STANDUP_TIMES;

  return (
    <div className="flex min-h-full flex-col">
      <header className="box-border flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-default px-6 py-3">
        <nav
          aria-label={t('standup.settings.breadcrumb')}
          className="flex min-w-0 items-center gap-1.5 text-[14px]"
        >
          <Link to="/standup" className="text-2 hover:text-default">
            {t('shell.standup')}
          </Link>
          <ChevronRightIcon size={14} className="flex-none text-muted" />
          <Link to={back} className="truncate text-2 hover:text-default">
            {group.name}
          </Link>
          <ChevronRightIcon size={14} className="flex-none text-muted" />
          <span aria-current="page" className="font-semibold">
            {t('standup.settings.title')}
          </span>
        </nav>
        <div className="flex gap-2">
          <Link
            to={back}
            className="flex h-9 items-center rounded-[8px] px-3 text-[13px] font-medium text-2 hover:bg-hover"
          >
            {t('standup.settings.cancel')}
          </Link>
          {!readOnly && (
            <Button
              variant="primary"
              className="h-9 px-3.5"
              disabled={update.isPending}
              onClick={save}
            >
              {t('standup.settings.save')}
            </Button>
          )}
        </div>
      </header>

      <form
        aria-label={t('standup.groupSettings')}
        className="box-border flex w-full max-w-[840px] flex-col px-6 pt-2 pb-12"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {readOnly && (
          <p className="mt-4 mb-0 rounded-[8px] bg-surface-2 px-3 py-2 text-[13px] text-2">
            {t('standup.settings.readOnly')}
          </p>
        )}
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          <Section
            id={`${id}-general`}
            title={t('standup.settings.general')}
            description={t('standup.settings.generalSub')}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-name`} className={labelClass}>
                {t('standup.settings.nameLabel')}
              </label>
              <input
                id={`${id}-name`}
                value={draft.name}
                maxLength={60}
                aria-invalid={showErrors && errors.name ? true : undefined}
                aria-describedby={showErrors && errors.name ? `${id}-name-err` : undefined}
                onChange={(e) => {
                  set({ name: e.target.value });
                }}
                className="box-border h-[38px] rounded-[8px] border border-default bg-surface px-3 text-[14px] text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink disabled:opacity-60"
              />
              {showErrors && errors.name && (
                <span id={`${id}-name-err`} role="alert" className="text-[12px] text-danger">
                  {errors.name}
                </span>
              )}
            </div>
          </Section>

          <section id="members" aria-labelledby={`${id}-members-h`} className={sectionClass}>
            <div>
              <h2 id={`${id}-members-h`} className="m-0 text-[15px] font-semibold">
                {t('standup.settings.members')}
              </h2>
              <p className="mt-1 mb-0 text-[13px] text-muted">
                {t('standup.settings.membersSub', { count: draft.members.length })}
              </p>
            </div>
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-default">
              {draft.members.length === 0 && (
                <p className="m-0 border-b border-subtle px-3 py-3 text-[13px] text-muted">
                  {t('standup.settings.noMembers')}
                </p>
              )}
              <ul className="m-0 list-none p-0">
                {draft.members.map((user) => {
                  const facilitator = draft.facilitatorId === user.id;
                  return (
                    <li
                      key={user.id}
                      className="flex min-h-12 items-center gap-2.5 border-b border-subtle py-1.5 pr-2 pl-3 hover:bg-subtle"
                    >
                      <Avatar user={user} size={28} title={null} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{user.name}</span>
                        {titleOf.get(user.id) && (
                          <span className="truncate text-[12px] text-muted">
                            {titleOf.get(user.id)}
                          </span>
                        )}
                      </span>
                      {facilitator && (
                        <span className="flex h-[22px] flex-none items-center rounded-[11px] bg-accent-soft px-2 text-[12px] font-semibold text-accent-ink">
                          {t('standup.settings.facilitator')}
                        </span>
                      )}
                      {!readOnly && (
                        <>
                          <Menu
                            label={t('standup.settings.memberActions', { name: user.name })}
                            placement="bottom-end"
                            width={200}
                            items={[
                              facilitator
                                ? {
                                    id: 'unfacilitate',
                                    label: t('standup.settings.removeFacilitator'),
                                    onSelect: () => {
                                      set({ facilitatorId: null });
                                    },
                                  }
                                : {
                                    id: 'facilitate',
                                    label: t('standup.settings.makeFacilitator'),
                                    onSelect: () => {
                                      set({ facilitatorId: user.id });
                                    },
                                  },
                            ]}
                            trigger={(props) => (
                              <IconButton
                                {...props}
                                label={t('standup.settings.memberActions', { name: user.name })}
                                size={32}
                                icon={<MoreIcon size={16} />}
                              />
                            )}
                          />
                          <IconButton
                            label={t('standup.settings.removeMember', { name: user.name })}
                            size={32}
                            radius={6}
                            icon={<CloseIcon size={14} />}
                            onClick={() => {
                              set({
                                members: draft.members.filter((m) => m.id !== user.id),
                                facilitatorId: facilitator ? null : draft.facilitatorId,
                              });
                            }}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!readOnly && (
                <AssigneePicker
                  value={draft.members}
                  members={workspaceMembers}
                  label={t('standup.settings.addMemberLabel')}
                  onChange={(users) => {
                    const picked = new Set(users.map((u) => u.id));
                    const kept = draft.members.filter((m) => picked.has(m.id));
                    const added = users.filter((u) => !memberIds.has(u.id));
                    set({
                      members: [...kept, ...added],
                      facilitatorId:
                        draft.facilitatorId && picked.has(draft.facilitatorId)
                          ? draft.facilitatorId
                          : null,
                    });
                  }}
                  trigger={(props) => (
                    <button
                      {...props}
                      ref={(node) => {
                        props.ref(node);
                        addRef.current = node;
                      }}
                      type="button"
                      aria-label={t('standup.settings.addMemberLabel')}
                      className="flex h-11 w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left text-[14px] text-muted hover:bg-subtle"
                    >
                      <PlusIcon size={14} className="flex-none" />
                      {t('standup.settings.addMember')}
                    </button>
                  )}
                />
              )}
            </div>
          </section>

          <Section
            id={`${id}-schedule`}
            title={t('standup.settings.schedule')}
            description={t('standup.settings.scheduleSub')}
          >
            <div className="flex flex-col gap-2">
              <span id={`${id}-days`} className={labelClass}>
                {t('standup.settings.days')}
              </span>
              <div role="group" aria-labelledby={`${id}-days`} className="flex flex-wrap gap-1.5">
                {WEEKDAY_KEYS.map((key, day) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      title={t(`standup.weekdays.${key}.full`)}
                      aria-label={t(`standup.weekdays.${key}.full`)}
                      onClick={() => {
                        set({
                          days: on
                            ? draft.days.filter((d) => d !== day)
                            : [...draft.days, day].sort((a, b) => a - b),
                        });
                      }}
                      className={cn(
                        'box-border h-9 min-w-12 rounded-[8px] border px-2.5 text-[13px] font-semibold disabled:opacity-60',
                        on
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-default bg-surface text-muted enabled:hover:bg-hover',
                      )}
                    >
                      {t(`standup.weekdays.${key}.short`)}
                    </button>
                  );
                })}
              </div>
              {showErrors && errors.days && (
                <span role="alert" className="text-[12px] text-danger">
                  {errors.days}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-post`} className={labelClass}>
                  {t('standup.settings.postBy')}
                </label>
                <select
                  id={`${id}-post`}
                  value={draft.postBy}
                  onChange={(e) => {
                    set({ postBy: e.target.value });
                  }}
                  className={selectClass}
                >
                  {timeOptions(draft.postBy).map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-remind`} className={labelClass}>
                  {t('standup.settings.reminder')}
                </label>
                <select
                  id={`${id}-remind`}
                  value={draft.reminderAt ?? ''}
                  onChange={(e) => {
                    set({ reminderAt: e.target.value || null });
                  }}
                  className={selectClass}
                >
                  {timeOptions(draft.reminderAt).map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                  <option value="">{t('standup.settings.noReminder')}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-meet`} className={labelClass}>
                  {t('standup.settings.meetAt')}
                </label>
                <select
                  id={`${id}-meet`}
                  value={draft.meetingAt ?? ''}
                  onChange={(e) => {
                    set({ meetingAt: e.target.value || null });
                  }}
                  className={selectClass}
                >
                  {timeOptions(draft.meetingAt).map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                  <option value="">{t('standup.settings.noMeeting')}</option>
                </select>
              </div>
            </div>
            {showErrors && errors.times && (
              <span role="alert" className="-mt-2 text-[12px] text-danger">
                {errors.times}
              </span>
            )}

            <div className="flex flex-col gap-1.5">
              <span id={`${id}-tz`} className={labelClass}>
                {t('standup.settings.timezone')}
              </span>
              <TimezonePicker
                value={draft.timezone}
                label={t('standup.settings.timezone')}
                disabled={readOnly}
                onChange={(timezone) => {
                  set({ timezone });
                }}
                className="h-[38px] w-full max-w-none rounded-[8px] border-default bg-surface text-[14px]"
              />
              <span className="text-[12px] text-muted">{t('standup.settings.tzHint')}</span>
              {yourTimes && (
                <span className="text-[12px] text-2">
                  {t('standup.settings.yourTime', {
                    zone: zoneLabel(viewerZone, i18n.language, t),
                    times: yourTimes,
                  })}
                </span>
              )}
            </div>
          </Section>

          <Section
            id={`${id}-meeting`}
            title={t('standup.settings.meeting')}
            description={t('standup.settings.meetingSub')}
          >
            <div className="flex flex-col gap-2">
              <span id={`${id}-per`} className={labelClass}>
                {t('standup.settings.timePer')}
              </span>
              <SegmentedControl<string>
                size="md"
                labelledBy={`${id}-per`}
                disabled={readOnly}
                className="self-start"
                options={SECONDS_PER_PERSON.map((s) => ({
                  value: String(s),
                  label: t('standup.settings.minutes', { count: s / 60 }),
                }))}
                value={String(draft.secondsPerPerson)}
                onChange={(v) => {
                  set({ secondsPerPerson: Number(v) });
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span id={`${id}-order`} className={labelClass}>
                {t('standup.settings.order')}
              </span>
              <SegmentedControl<SpeakingOrder>
                size="md"
                labelledBy={`${id}-order`}
                disabled={readOnly}
                className="self-start"
                options={SPEAKING_ORDERS.map((o) => ({
                  value: o,
                  label: t(`standup.settings.orders.${o}`),
                }))}
                value={draft.speakingOrder}
                onChange={(speakingOrder) => {
                  set({ speakingOrder });
                }}
              />
            </div>
            <CheckRow
              checked={draft.showBlockersFirst}
              onChange={(showBlockersFirst) => {
                set({ showBlockersFirst });
              }}
              label={t('standup.settings.blockersFirst')}
              hint={t('standup.settings.blockersFirstHint')}
            />
            <CheckRow
              checked={draft.markLinkedTasksBlocked}
              onChange={(markLinkedTasksBlocked) => {
                set({ markLinkedTasksBlocked });
              }}
              label={t('standup.settings.markTasks')}
              hint={t('standup.settings.markTasksHint')}
            />
          </Section>
        </fieldset>

        {!readOnly && (
          <section aria-labelledby={`${id}-danger-h`} className={cn(sectionClass, 'border-t')}>
            <div>
              <h2 id={`${id}-danger-h`} className="m-0 text-[15px] font-semibold">
                {t('standup.settings.archive')}
              </h2>
              <p className="mt-1 mb-0 text-[13px] text-muted">
                {t('standup.settings.archiveHint')}
              </p>
            </div>
            <div>
              <Button
                icon={<ArchiveIcon size={14} />}
                disabled={archive.isPending}
                onClick={onArchive}
              >
                {t('standup.settings.archive')}
              </Button>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}

/** 18px accent checkbox with a 500 label and a 12px muted hint. */
function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 has-[:disabled]:cursor-default">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="mt-px mb-0 ml-0 size-[18px] flex-none accent-[var(--accent)]"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-[12px] text-muted">{hint}</span>
      </span>
    </label>
  );
}
