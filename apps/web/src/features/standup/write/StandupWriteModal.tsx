import type { StandupDay, StandupSuggestions } from '@kite/shared';
import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStandupSuggestions } from '../../../api/standups';
import { useWorkspaceMembers } from '../../../api/workspaces';
import { useAuth } from '../../../auth/useAuth';
import { CloseIcon, UsersIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { buttonVariants } from '../../../components/ui/buttonStyles';
import { Kbd } from '../../../components/ui/Kbd';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { cn } from '../../../lib/cn';
import { DEFAULT_TIMEZONE } from '../../../lib/dates';
import { errorMessage } from '../../../lib/mutationErrors';
import { formatClock } from '../../../lib/relativeTime';
import { useDates } from '../../../lib/useDates';
import { useIsNarrow } from '../../../lib/useMediaQuery';
import { BlockersFieldset, TodayFieldset, YesterdayFieldset, type WriteVariant } from './Sections';
import { useWriteForm, type AutosaveState } from './useWriteForm';

/**
 * Write update. Desktop (StandupWrite.dc.html): 640px modal, 56px from the top. Under 640px
 * (StandupWriteMobile.dc.html): a full-screen page sized to the visible viewport, so the
 * Post button stays above the keyboard. Yesterday from my activity, Today chips, blockers
 * with a linked task and who can help. Drafts autosave; Esc / × / the scrim close and keep
 * a draft.
 */
export function StandupWriteModal({ day, onClose }: { day: StandupDay; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const narrow = useIsNarrow();
  const variant: WriteVariant = narrow ? 'mobile' : 'desktop';
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
    <Modal
      open
      onClose={requestClose}
      labelledBy={titleId}
      width={640}
      top={56}
      fullScreen={narrow}
      initialFocus={-1}
    >
      {narrow ? (
        <MobileHeader day={day} titleId={titleId} onClose={requestClose} />
      ) : (
        <WriteHeader day={day} titleId={titleId} onClose={requestClose} />
      )}
      {suggestions.data ? (
        <WriteForm
          day={day}
          suggestions={suggestions.data}
          variant={variant}
          onClose={onClose}
          setCloser={setCloser}
        />
      ) : suggestions.isError ? (
        <p className="m-0 px-5 py-6 text-[13px] text-muted">{errorMessage(suggestions.error)}</p>
      ) : (
        <div
          aria-busy="true"
          aria-label={t('common.loading')}
          className={cn('flex flex-col gap-4 py-5', narrow ? 'px-4' : 'px-5')}
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

/** Phone top bar (56px): a 44px ×, the centered title and "{group} · {date}". */
function MobileHeader({
  day,
  titleId,
  onClose,
}: {
  day: StandupDay;
  titleId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { formatDay } = useDates();
  return (
    <div className="flex h-14 flex-none items-center gap-2 border-b border-subtle px-2">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('standup.write.closeShort')}
        className="flex size-11 flex-none items-center justify-center rounded-full text-default hover:bg-hover"
      >
        <CloseIcon size={20} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <h2 id={titleId} className="m-0 text-[16px] leading-[22px] font-semibold">
          {t('standup.write.title')}
        </h2>
        <span className="max-w-full truncate text-[12px] leading-4 text-muted">
          {day.group.name} · {formatDay('weekdayShortDate', day.date)}
        </span>
      </div>
      {/* Balances the × so the title stays centered. */}
      <span aria-hidden="true" className="size-11 flex-none" />
    </div>
  );
}

function AutosaveStatus({ state, className }: { state: AutosaveState; className?: string }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const text =
    state.kind === 'saving'
      ? t('standup.write.saving')
      : state.kind === 'saved'
        ? t('standup.write.autosaved', { time: formatClock(state.at, zone) })
        : state.kind === 'failed'
          ? t('standup.write.saveFailed')
          : '';
  return (
    <span
      role="status"
      className={cn(
        'text-[12px]',
        state.kind === 'failed' ? 'text-danger' : 'text-muted',
        className,
      )}
    >
      {text}
    </span>
  );
}

function WriteForm({
  day,
  suggestions,
  variant,
  onClose,
  setCloser,
}: {
  day: StandupDay;
  suggestions: StandupSuggestions;
  variant: WriteVariant;
  onClose: () => void;
  /** Esc / × / the scrim call this form's close (it keeps a draft). */
  setCloser: (close: () => void) => void;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const members = useWorkspaceMembers(day.group.workspaceId);
  const form = useWriteForm({ day, suggestions, onClose });
  const { draft, setDraft, posted, empty, error, submitting } = form;
  const mobile = variant === 'mobile';

  useEffect(() => {
    setCloser(form.closeKeepingDraft);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!empty) form.submit('posted');
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
  const visibleLine = t('standup.write.visibleTo', { count: visibleTo, group: day.group.name });
  const postLabel = posted ? t('standup.write.saveChanges') : t('standup.write.post');

  return (
    <form
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) form.submit('posted');
      }}
      className={cn('flex min-h-0 flex-col', mobile && 'flex-1 text-[15px] leading-[22px]')}
    >
      <div
        className={cn(
          'flex flex-col overflow-y-auto',
          mobile
            ? 'min-h-0 flex-1 gap-[22px] px-4 pt-4 pb-6'
            : 'max-h-[calc(100dvh-56px-64px-64px-24px)] gap-5 px-5 pt-4 pb-5',
        )}
      >
        <YesterdayFieldset draft={draft} setDraft={setDraft} variant={variant} />
        <TodayFieldset draft={draft} setDraft={setDraft} variant={variant} />
        <BlockersFieldset
          draft={draft}
          setDraft={setDraft}
          variant={variant}
          suggestedTasks={suggestedTasks}
          members={helpers}
        />
        {error && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      {mobile ? (
        <div className="flex flex-none flex-col gap-1.5 border-t border-subtle bg-surface px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={submitting || empty}
            className={cn(
              buttonVariants.primary,
              'flex h-12 items-center justify-center rounded-[12px] text-[16px] font-semibold disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {postLabel}
          </button>
          <span className="text-center text-[12px] leading-4 text-muted">
            <AutosaveStatus state={form.autosave} />
            {form.autosave.kind === 'idle' ? '' : ' · '}
            {visibleLine}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-subtle bg-subtle py-3 pr-4 pl-5">
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <UsersIcon size={12} />
            {visibleLine}
          </span>
          <span className="flex-1" />
          <AutosaveStatus state={form.autosave} />
          {!posted && (
            <Button
              variant="ghost"
              disabled={submitting || empty}
              onClick={() => {
                form.submit('draft');
              }}
            >
              {t('standup.write.saveDraft')}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || empty}
            kbd="⌘ ↵"
            className="pr-2"
          >
            {postLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
