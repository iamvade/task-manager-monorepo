import type { RichTextNode } from '@kite/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateTask } from '../../api/tasks';
import { RichTextEditor } from '../../components/editor/RichTextEditor';
import { CheckIcon } from '../../components/icons';
import { useTaskView } from './TaskContext';

const SAVE_DELAY = 800;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Description editor with autosave: changes are saved 800ms after the last keystroke, and right
 * away on blur, close and unmount. A subtle "Saving… / Saved" note sits next to the heading.
 */
export function TaskDescription() {
  const { t } = useTranslation();
  const { task, mentions } = useTaskView();
  const update = useUpdateTask();
  const [state, setState] = useState<SaveState>('idle');
  /** The unsaved document (`null` = cleared); `undefined` when nothing is pending. */
  const pending = useRef<RichTextNode | null | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ task, mutate: update.mutate });
  useEffect(() => {
    latest.current = { task, mutate: update.mutate };
  });

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const doc = pending.current;
    if (doc === undefined) return;
    pending.current = undefined;
    setState('saving');
    latest.current.mutate(
      { task: latest.current.task, patch: { description: doc } },
      {
        onSuccess: () => {
          setState('saved');
        },
        onError: () => {
          pending.current ??= doc;
          setState('error');
        },
      },
    );
  }, []);

  // Close / unmount saves what's left.
  useEffect(() => flush, [flush]);

  useEffect(() => {
    if (state !== 'saved') return;
    const id = window.setTimeout(() => {
      setState('idle');
    }, 2000);
    return () => {
      window.clearTimeout(id);
    };
  }, [state]);

  return (
    <section aria-labelledby="desc-h" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="desc-h" className="m-0 text-[13px] font-semibold text-2">
          {t('drawer.description')}
        </h3>
        <span role="status" className="flex items-center gap-1 text-[12px] text-muted">
          {state === 'saving' && t('drawer.saving')}
          {state === 'saved' && (
            <>
              <CheckIcon size={12} className="text-success" />
              {t('drawer.saved')}
            </>
          )}
          {state === 'error' && (
            <>
              <span className="text-danger">{t('drawer.saveFailed')}</span>
              <button
                type="button"
                onClick={flush}
                className="h-6 rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] font-medium text-accent-ink hover:bg-hover"
              >
                {t('common.retry')}
              </button>
            </>
          )}
        </span>
      </div>
      <RichTextEditor
        variant="description"
        label={t('drawer.description')}
        placeholder={t('drawer.descriptionPlaceholder')}
        value={task.description}
        mentions={mentions}
        onChange={(doc, editor) => {
          pending.current = editor.isEmpty ? null : doc;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, SAVE_DELAY);
        }}
        onBlur={flush}
        onEscape={() => {
          // Esc leaves the editor (saving); a second Esc closes the drawer.
          (document.activeElement as HTMLElement | null)?.blur();
          return true;
        }}
      />
    </section>
  );
}
