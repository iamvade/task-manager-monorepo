import { shortName } from '@kite/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateTask } from '../../api/tasks';
import { useAuth } from '../../auth/useAuth';
import { formatDate, todayFor } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { useRelativeTime } from '../../lib/useRelativeTime';
import { useRealtimeStore } from '../../stores/realtime';
import { useTaskView } from './TaskContext';

export const TITLE_ID = 'task-title';

/**
 * Title textarea (22/30/600; transparent border → hover border → accent on focus) and the
 * "Created by … · Updated …" line. Enter or blur saves, Esc reverts; an empty title reverts.
 * While focused the text is local, so a background refetch never replaces what's being typed.
 */
export function TaskTitle() {
  const { t } = useTranslation();
  const { task } = useTaskView();
  const { me } = useAuth();
  const { locale, today } = useDates();
  const { ago } = useRelativeTime();
  const update = useUpdateTask();
  const [draft, setDraft] = useState<string | null>(null);
  // The title when editing started: if it changes underneath, someone else renamed the task.
  const [base, setBase] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const value = draft ?? task.title;
  const { members } = useTaskView();
  const editorId = useRealtimeStore((s) => s.recentEdits[task.id]?.title?.actorId);
  const conflict = draft !== null && base !== null && task.title !== base;
  const editorName = members.find((m) => m.user.id === editorId)?.user.name ?? t('drawer.someone');

  // Grow with the text (the design's rows="2" is the minimum).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  function save() {
    const title = draft?.trim();
    setDraft(null);
    setBase(null);
    if (!title || title === task.title) return;
    update.mutate({ task, patch: { title } });
  }

  const createdOn = todayFor(me?.preferences.timezone, new Date(task.createdAt));

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={TITLE_ID} className="sr-only">
        {t('drawer.titleLabel')}
      </label>
      <textarea
        id={TITLE_ID}
        ref={ref}
        rows={1}
        value={value}
        maxLength={500}
        onFocus={() => {
          setDraft(task.title);
          setBase(task.title);
        }}
        onChange={(e) => {
          setDraft(e.target.value.replace(/\n/g, ' '));
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(task.title);
            setBase(task.title);
            requestAnimationFrame(() => ref.current?.blur());
          }
        }}
        className="-mx-2 box-border resize-none overflow-hidden rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[22px] leading-[30px] font-semibold tracking-[-0.01em] text-default outline-none hover:border-default focus:border-accent focus-visible:outline-none"
      />
      {conflict && (
        <span role="status" className="flex flex-wrap items-center gap-1.5 text-[12px] text-2">
          {t('drawer.titleChanged', { name: shortName(editorName), title: task.title })}
          <button
            type="button"
            // Keeps focus in the textarea (blur would save the local text).
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              setDraft(task.title);
              setBase(task.title);
            }}
            className="rounded-[4px] border-0 bg-transparent p-0 text-[12px] font-medium text-accent-ink hover:underline"
          >
            {t('drawer.useTheirs')}
          </button>
        </span>
      )}
      <span className="text-[12px] text-muted">
        {t('drawer.createdMeta', {
          name: shortName(task.creator.name),
          date: formatDate(createdOn, locale, today),
          relative: ago(task.updatedAt, { inline: true }),
        })}
      </span>
    </div>
  );
}
