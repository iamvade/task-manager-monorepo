import type { StandupDay, StandupSuggestions } from '@kite/shared';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../api/client';
import { useSaveStandupEntry, useStandupSuggestions } from '../../../api/standups';
import { useWorkspaceMembers } from '../../../api/workspaces';
import { useAuth } from '../../../auth/useAuth';
import { CloseIcon, UsersIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Kbd } from '../../../components/ui/Kbd';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { DEFAULT_TIMEZONE } from '../../../lib/dates';
import { errorMessage } from '../../../lib/mutationErrors';
import { formatClock } from '../../../lib/relativeTime';
import { useDates } from '../../../lib/useDates';
import { toast } from '../../../stores/toast';
import { draftBody, initialDraft, isEmptyBody, type Draft } from './draft';
import { BlockersFieldset, TodayFieldset, YesterdayFieldset } from './Sections';

const STANDUP_CODES = [
  'STANDUP_DAY_CLOSED',
  'NOT_STANDUP_DAY',
  'GROUP_ARCHIVED',
  'ALREADY_POSTED',
  'INVALID_HELPER',
  'INVALID_TASK',
] as const;

/**
 * Write update (StandupWrite.dc.html): 640px modal, Yesterday from my activity, Today chips,
 * blockers with a linked task and who can help. Esc / the scrim close it and keep a draft.
 */
export function StandupWriteModal({ day, onClose }: { day: StandupDay; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const suggestions = useStandupSuggestions(day.group.id, day.date);
  // The form swaps in "close and keep a draft" once it's on screen.
  const closerRef = useRef(onClose);
  const requestClose = () => {
    closerRef.current();
  };
  const setCloser = useCallback((fn: () => void) => {
    closerRef.current = fn;
  }, []);
  return (
    <Modal open onClose={requestClose} labelledBy={titleId} width={640} top={56} initialFocus={-1}>
      <WriteHeader day={day} titleId={titleId} onClose={requestClose} />
      {suggestions.data ? (
        <WriteForm
          day={day}
          suggestions={suggestions.data}
          onClose={onClose}
          setCloser={setCloser}
        />
      ) : suggestions.isError ? (
        <p className="m-0 px-5 py-6 text-[13px] text-muted">{errorMessage(suggestions.error)}</p>
      ) : (
        <div
          aria-busy="true"
          aria-label={t('common.loading')}
          className="flex flex-col gap-4 px-5 py-5"
        >
          <Skeleton height={14} width={220} />
          <Skeleton height={120} />
          <Skeleton height={14} width={180} />
          <Skeleton height={60} />
        </div>
      )}
    </Modal>
  );
}

function WriteHeader({
  day,
  titleId,
  onClose,
}: {
  day: StandupDay;
  titleId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const { formatDay } = useDates();
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const date = formatDay(i18n.language === 'en' ? 'weekdayShortDate' : 'weekdayLongDate', day.date);
  const dueBy = t('standup.write.dueBy', { time: formatClock(new Date(day.postByAt), zone) });
  return (
    <div className="flex items-center gap-3 border-b border-subtle pt-4 pr-4 pb-3 pl-5">
      {me && <Avatar user={me.user} size={32} textSize={11} title={null} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id={titleId} className="m-0 text-[16px] leading-[22px] font-semibold">
          {t('standup.write.title')}
        </h2>
        <span className="truncate text-[12px] text-muted">
          {day.group.name} · {date} · {dueBy}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('standup.write.close')}
        className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-3 hover:bg-hover"
      >
        <Kbd>Esc</Kbd>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

function WriteForm({
  day,
  suggestions,
  onClose,
  setCloser,
}: {
  day: StandupDay;
  suggestions: StandupSuggestions;
  onClose: () => void;
  /** Esc / × / the scrim call this form's close (it keeps a draft). */
  setCloser: (close: () => void) => void;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(day.myEntry, suggestions));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveStandupEntry(day.group.id, day.group.workspaceId);
  const members = useWorkspaceMembers(day.group.workspaceId);
  const posted = day.myEntry?.status === 'posted';
  const initial = useMemo(
    () => JSON.stringify(draftBody(initialDraft(day.myEntry, suggestions), 'draft')),
    // The state the modal opened with; later refetches don't move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const body = draftBody(draft, posted ? 'posted' : 'draft');
  const dirty = JSON.stringify({ ...body, status: 'draft' }) !== initial;
  const empty = isEmptyBody(body);

  const submit = (status: 'draft' | 'posted') => {
    if (save.isPending) return;
    setError(null);
    save.mutate(
      { date: day.date, body: { ...body, status } },
      {
        onSuccess: () => {
          toast({
            message:
              status === 'draft'
                ? t('standup.write.draftSaved')
                : posted
                  ? t('standup.write.changesSaved')
                  : t('standup.write.posted'),
          });
          onClose();
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : null;
          setError(
            code && (STANDUP_CODES as readonly string[]).includes(code)
              ? t(`standup.write.errors.${code as (typeof STANDUP_CODES)[number]}`)
              : errorMessage(err),
          );
        },
      },
    );
  };

  // Esc, ×, the scrim: keep what I wrote as a draft (a posted update closes without saving).
  const closeKeepingDraft = () => {
    if (dirty && !posted && !empty && !save.isPending) {
      save.mutate(
        { date: day.date, body: { ...body, status: 'draft' } },
        {
          onSuccess: () => {
            toast({ message: t('standup.write.draftSaved') });
          },
        },
      );
    }
    onClose();
  };
  useEffect(() => {
    setCloser(closeKeepingDraft);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!empty) submit('posted');
    }
  };

  const suggestedTasks = [
    ...suggestions.today.map((s) => s.task),
    ...suggestions.yesterday.map((s) => s.task),
  ].filter((task, i, all) => all.findIndex((x) => x.id === task.id) === i);
  const visibleTo = day.group.members.length;
  const inGroup = new Set(day.group.members.map((m) => m.user.id));
  const helpers = (members.data ?? []).filter(
    (m) => inGroup.has(m.user.id) && m.user.id !== me?.user.id && !m.deactivatedAt,
  );

  return (
    <form
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) submit('posted');
      }}
      className="flex min-h-0 flex-col"
    >
      <div className="flex max-h-[calc(100vh-56px-64px-64px-24px)] flex-col gap-5 overflow-y-auto px-5 pt-4 pb-5">
        <YesterdayFieldset draft={draft} setDraft={setDraft} />
        <TodayFieldset draft={draft} setDraft={setDraft} />
        <BlockersFieldset
          draft={draft}
          setDraft={setDraft}
          suggestedTasks={suggestedTasks}
          members={helpers}
        />
        {error && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-subtle bg-subtle py-3 pr-4 pl-5">
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          <UsersIcon size={12} />
          {t('standup.write.visibleTo', { count: visibleTo, group: day.group.name })}
        </span>
        <span className="flex-1" />
        {!posted && (
          <Button
            variant="ghost"
            disabled={save.isPending || empty}
            onClick={() => {
              submit('draft');
            }}
          >
            {t('standup.write.saveDraft')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || empty}
          kbd="⌘ ↵"
          className="pr-2"
        >
          {posted ? t('standup.write.saveChanges') : t('standup.write.post')}
        </Button>
      </div>
    </form>
  );
}
