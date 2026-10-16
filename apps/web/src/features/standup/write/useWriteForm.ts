import type { SaveStandupEntry, StandupDay, StandupSuggestions } from '@kite/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../api/client';
import { useSaveStandupEntry } from '../../../api/standups';
import { errorMessage } from '../../../lib/mutationErrors';
import { toast } from '../../../stores/toast';
import {
  contentKey,
  draftBody,
  initialDraft,
  isEmptyBody,
  sentBlockerUids,
  withSavedBlockerIds,
  type Draft,
} from './draft';

const STANDUP_CODES = [
  'STANDUP_DAY_CLOSED',
  'NOT_STANDUP_DAY',
  'GROUP_ARCHIVED',
  'ALREADY_POSTED',
  'INVALID_HELPER',
  'INVALID_TASK',
] as const;

/** Errors after which another save can't succeed: autosave stops. */
const FINAL_CODES = new Set([
  'STANDUP_DAY_CLOSED',
  'NOT_STANDUP_DAY',
  'GROUP_ARCHIVED',
  'ALREADY_POSTED',
]);

/** A draft saves itself this long after the first unsaved change (and again while typing). */
export const AUTOSAVE_MS = 2000;

export type AutosaveState =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed' };

/**
 * The write form's state and saving, shared by the desktop modal and the phone page.
 * A draft (never a posted update) autosaves a few seconds after each change; Save draft,
 * Post and closing wait for a save in flight, so saves never overlap.
 */
export function useWriteForm({
  day,
  suggestions,
  onClose,
}: {
  day: StandupDay;
  suggestions: StandupSuggestions;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(day.myEntry, suggestions));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>({ kind: 'idle' });
  const save = useSaveStandupEntry(day.group.id, day.group.workspaceId);
  const posted = day.myEntry?.status === 'posted';

  const body = draftBody(draft, posted ? 'posted' : 'draft');
  const key = contentKey(body);
  const empty = isEmptyBody(body);

  // What the server has (the state the form opened with, then every save): state for
  // rendering, the ref for saves in flight.
  const [savedKey, setSavedKey] = useState(key);
  const savedKeyRef = useRef(key);
  const dirty = key !== savedKey;
  const latest = useRef({ draft, posted, empty, key });
  const inflight = useRef<Promise<unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const describe = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : null;
    return code && (STANDUP_CODES as readonly string[]).includes(code)
      ? t(`standup.write.errors.${code as (typeof STANDUP_CODES)[number]}`)
      : errorMessage(err);
  };

  /** Sends the current form (after any save in flight) and remembers what was saved. */
  const send = async (status: SaveStandupEntry['status']) => {
    while (inflight.current) await inflight.current.catch(() => undefined);
    const current = latest.current;
    const sentKey = current.key;
    const sent = sentBlockerUids(current.draft);
    const run = save
      .mutateAsync({ date: day.date, body: { ...draftBody(current.draft, status), status } })
      .then((entry) => {
        savedKeyRef.current = sentKey;
        setSavedKey(sentKey);
        setDraft((d) => withSavedBlockerIds(d, sent, entry));
        return entry;
      });
    inflight.current = run;
    try {
      return await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  };

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Saves the draft if something changed since the last save; quiet unless it fails. */
  const flush = async () => {
    cancelTimer();
    while (inflight.current) await inflight.current.catch(() => undefined);
    const current = latest.current;
    if (current.posted || current.empty || stopped.current) return false;
    if (current.key === savedKeyRef.current) return false;
    setAutosave({ kind: 'saving' });
    try {
      await send('draft');
      setAutosave({ kind: 'saved', at: new Date() });
      return true;
    } catch (err) {
      setAutosave({ kind: 'failed' });
      const code = err instanceof ApiError ? err.code : null;
      if (code && FINAL_CODES.has(code)) {
        stopped.current = true;
        setError(describe(err));
      }
      return false;
    }
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    latest.current = { draft, posted, empty, key };
    flushRef.current = flush;
  });

  // Every few seconds while there are unsaved changes (the timer isn't reset by typing).
  useEffect(() => {
    if (posted || empty || !dirty || stopped.current || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void flushRef.current();
    }, AUTOSAVE_MS);
  }, [posted, empty, dirty, key]);

  // Leaving without closing (a link, the phone's back button): keep what was written.
  useEffect(
    () => () => {
      cancelTimer();
      void flushRef.current();
    },
    [],
  );

  const submit = async (status: 'draft' | 'posted') => {
    if (submitting) return;
    cancelTimer();
    setError(null);
    setSubmitting(true);
    try {
      await send(status);
      toast({
        message:
          status === 'draft'
            ? t('standup.write.draftSaved')
            : posted
              ? t('standup.write.changesSaved')
              : t('standup.write.posted'),
      });
      onClose();
    } catch (err) {
      setError(describe(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Esc, ×, the scrim: keep what I wrote as a draft (a posted update closes without saving).
  const closeKeepingDraft = () => {
    const changed = latest.current.key !== savedKeyRef.current;
    if (changed && !posted && !empty && !stopped.current) {
      void flush().then((saved) => {
        if (saved) toast({ message: t('standup.write.draftSaved') });
      });
    }
    onClose();
  };

  return {
    draft,
    setDraft,
    posted,
    empty,
    error,
    submitting,
    autosave,
    submit: (status: 'draft' | 'posted') => {
      void submit(status);
    },
    closeKeepingDraft,
  };
}
