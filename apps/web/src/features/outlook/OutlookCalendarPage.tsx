import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import {
  useConnectOutlook,
  useDisconnectOutlook,
  useOutlookBusy,
  useOutlookConnection,
  useOutlookEvents,
  useRefreshOutlook,
} from '../../api/outlook';
import { useCurrentWorkspace, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import { CalendarIcon, LockIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { useRelativeTime } from '../../lib/useRelativeTime';
import { useUiStore } from '../../stores/ui';
import { calendarDays, shiftPeriod } from '../calendar/calendarGrid';
import { CalendarToolbar } from '../calendar/CalendarToolbar';
import { PageHeader } from '../views/PageHeader';
import { OutlookGrid } from './OutlookGrid';
import { useBlocksByDay, type Block } from './useBlocksByDay';

const NO_BLOCKS: readonly Block[] = [];

/** Error codes from `PUT /me/outlook-calendar` → `outlook.connectError.*`. */
const CONNECT_ERRORS: Record<
  string,
  'invalidLink' | 'unreachable' | 'notFound' | 'notCalendar' | 'tooLarge'
> = {
  INVALID_OUTLOOK_LINK: 'invalidLink',
  OUTLOOK_UNREACHABLE: 'unreachable',
  OUTLOOK_NOT_FOUND: 'notFound',
  OUTLOOK_NOT_CALENDAR: 'notCalendar',
  OUTLOOK_TOO_LARGE: 'tooLarge',
};

/** Paste the ICS link from Outlook (steps shown); the server checks it before saving. */
function ConnectForm({ replacing, onDone }: { replacing: boolean; onDone?: () => void }) {
  const { t } = useTranslation();
  const connect = useConnectOutlook();
  const [url, setUrl] = useState('');
  const code = connect.error instanceof ApiError ? connect.error.code : null;
  const error = connect.isError
    ? t(`outlook.connectError.${CONNECT_ERRORS[code ?? ''] ?? 'unreachable'}`)
    : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    connect.mutate(url.trim(), { onSuccess: () => onDone?.() });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField
        label={t('outlook.linkLabel')}
        placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          connect.reset();
        }}
        error={error}
        hint={t('outlook.linkHint')}
        autoComplete="off"
        spellCheck={false}
        inputMode="url"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={connect.isPending || !url.trim()}>
          {connect.isPending
            ? t('outlook.connecting')
            : replacing
              ? t('outlook.saveLink')
              : t('outlook.connect')}
        </Button>
        {onDone && (
          <Button
            onClick={() => {
              onDone();
            }}
          >
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function SetupCard() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
          {t('outlook.setup.title')}
        </h2>
        <p className="m-0 text-[14px] leading-[22px] text-muted">{t('outlook.setup.body')}</p>
      </div>
      <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px] leading-[22px] text-2">
        <li>{t('outlook.setup.step1')}</li>
        <li>{t('outlook.setup.step2')}</li>
        <li>{t('outlook.setup.step3')}</li>
        <li>{t('outlook.setup.step4')}</li>
      </ol>
      <ConnectForm replacing={false} />
      <p className="m-0 flex items-start gap-1.5 text-[12px] leading-4 text-muted">
        <LockIcon size={12} className="mt-0.5 flex-none" />
        {t('outlook.setup.privacy')}
      </p>
    </div>
  );
}

/**
 * Outlook calendar (not designed; built from the Calendar's pieces). My published Outlook
 * calendar, read-only, by month or week; `?person=<userId>` shows a teammate's busy time instead.
 */
export function OutlookCalendarPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const { ago } = useRelativeTime();
  const workspace = useCurrentWorkspace();
  const [params, setParams] = useSearchParams();
  const mode = useUiStore((s) => s.calendarMode);
  const setMode = useUiStore((s) => s.setCalendarMode);
  const [anchor, setAnchor] = useState(dates.today);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const meId = me?.user.id ?? '';

  const members = useWorkspaceMembers(workspace?.id);
  const teammates = (members.data ?? []).filter(
    (m) => m.user.id !== meId && m.deactivatedAt === null,
  );
  const personParam = params.get('person');
  const person = teammates.find((m) => m.user.id === personParam) ?? null;

  const days = calendarDays(anchor, mode);
  const from = days[0]?.date ?? anchor;
  const to = days.at(-1)?.date ?? anchor;

  const connection = useOutlookConnection();
  const mine = useOutlookEvents(from, to, !person && connection.data?.connected === true);
  const busy = useOutlookBusy(workspace?.id, person?.user.id ?? null, from, to);
  const refresh = useRefreshOutlook(from, to);
  const disconnect = useDisconnectOutlook();

  const blocks: readonly Block[] = person
    ? (busy.data?.blocks ?? NO_BLOCKS)
    : (mine.data?.events ?? NO_BLOCKS);
  const byDay = useBlocksByDay(blocks, days, zone);

  const choosePerson = (userId: string) => {
    const next = new URLSearchParams(params);
    if (userId) next.set('person', userId);
    else next.delete('person');
    setParams(next, { replace: true });
  };

  const personPicker = teammates.length > 0 && (
    <label className="flex items-center gap-2 text-[13px] text-2">
      <span>{t('outlook.showing')}</span>
      <select
        value={person?.user.id ?? ''}
        onChange={(e) => {
          choosePerson(e.target.value);
        }}
        className="h-8 max-w-[220px] rounded-[8px] border border-control bg-control px-2 text-[13px] text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]"
      >
        <option value="">{t('outlook.myCalendar')}</option>
        {teammates.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {t('outlook.busyOf', { name: m.user.name })}
          </option>
        ))}
      </select>
    </label>
  );

  const header = (
    <PageHeader
      title={
        <h1 className="m-0 flex min-w-0 items-center gap-2 text-[16px] leading-6 font-semibold">
          <CalendarIcon size={18} className="flex-none text-2" />
          <span className="truncate">{t('outlook.title')}</span>
        </h1>
      }
      actions={personPicker || undefined}
    />
  );

  if (connection.isError) {
    return (
      <>
        {header}
        <ErrorState error={connection.error} />
      </>
    );
  }
  if (connection.isPending) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-2 p-6" aria-busy="true">
          <Skeleton width="30%" height={16} />
          <Skeleton height={320} />
        </div>
      </>
    );
  }

  const conn = connection.data;
  if (!person && !conn.connected) {
    return (
      <>
        {header}
        <div className="min-h-0 flex-1 overflow-auto">
          <SetupCard />
        </div>
      </>
    );
  }

  const status = person ? (
    <p className="m-0 text-[13px] text-muted">
      {busy.data && !busy.data.connected
        ? t('outlook.notConnectedOther', { name: person.user.name })
        : t('outlook.busyOnly', { name: person.user.name })}
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
      <span>
        {t('outlook.connectedTo', { host: conn.host ?? '' })}
        {conn.lastSyncedAt && (
          <> · {t('outlook.synced', { when: ago(conn.lastSyncedAt, { inline: true }) })}</>
        )}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
      >
        {refresh.isPending ? t('outlook.refreshing') : t('outlook.refresh')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(true);
        }}
      >
        {t('outlook.changeLink')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setConfirming(true);
        }}
      >
        {t('outlook.disconnect')}
      </Button>
    </div>
  );

  const lastError = person ? null : (mine.data?.lastError ?? conn.lastError);
  const loadError = person ? busy.error : mine.error;

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-4">
        <CalendarToolbar
          anchor={anchor}
          mode={mode}
          onModeChange={setMode}
          onToday={() => {
            setAnchor(dates.today);
          }}
          onStep={(step) => {
            setAnchor((a) => shiftPeriod(a, mode, step));
          }}
          projects={[]}
          hidden={[]}
          onToggleProject={() => undefined}
        />
        {status}
        {editing && !person && (
          <div className="max-w-[560px] rounded-[12px] border border-default p-4">
            <ConnectForm
              replacing
              onDone={() => {
                setEditing(false);
              }}
            />
          </div>
        )}
        {lastError && (
          <p
            role="status"
            className="m-0 rounded-[8px] border border-default bg-subtle px-3 py-2 text-[13px] text-2"
          >
            {t(`outlook.fetchError.${lastError}`)}
          </p>
        )}
        {loadError ? (
          <ErrorState error={loadError} />
        ) : (
          <div className="overflow-x-auto" aria-busy={(person ? busy : mine).isFetching}>
            <OutlookGrid
              mode={mode}
              days={days}
              byDay={byDay}
              onOpenWeek={(date) => {
                setAnchor(date);
                setMode('week');
              }}
            />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('outlook.disconnectTitle')}
        body={t('outlook.disconnectBody')}
        confirmLabel={t('outlook.disconnect')}
        tone="danger"
        pending={disconnect.isPending}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          disconnect.mutate(undefined, {
            onSettled: () => {
              setConfirming(false);
            },
          });
        }}
      />
    </>
  );
}
