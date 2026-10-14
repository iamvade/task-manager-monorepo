import { findTaskKeys, type RichTextNode } from '@kite/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useUpdateTask } from '../../api/tasks';
import { RichTextEditor } from '../../components/editor/RichTextEditor';
import { TASK_REF_ATTR } from '../../components/editor/taskKeys';
import { resolveTypedMentions } from '../../components/editor/typedMentions';
import { CheckIcon } from '../../components/icons';
import { useTaskView } from './TaskContext';
import { useTaskKeyHref } from './useTaskKeyHref';
import { markErrorHandled } from '../../lib/mutationErrors';

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
  const navigate = useNavigate();
  const taskHref = useTaskKeyHref();
  // Keys in the description, as links (keyboard reachable; the editor only styles them).
  const references = findTaskKeys(task.descriptionText).flatMap(({ text }) => {
    const href = text === task.key ? null : taskHref(text);
    return href ? [{ key: text, href }] : [];
  });
  const [state, setState] = useState<SaveState>('idle');
  /** The unsaved document (`null` = cleared); `undefined` when nothing is pending. */
  const pending = useRef<RichTextNode | null | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ task, mutate: update.mutate, mentions });
  useEffect(() => {
    latest.current = { task, mutate: update.mutate, mentions };
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
        onError: (err) => {
          // The editor shows "Couldn't save" itself.
          markErrorHandled(err);
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
      <div
        onClick={(e) => {
          // ⌘/Ctrl-click on a task key opens that task (a plain click keeps editing).
          if (!(e.metaKey || e.ctrlKey) || !(e.target instanceof HTMLElement)) return;
          const key = e.target.closest(`[${TASK_REF_ATTR}]`)?.getAttribute(TASK_REF_ATTR);
          const href = key ? taskHref(key) : null;
          if (!href) return;
          e.preventDefault();
          void navigate(href);
        }}
      >
        <RichTextEditor
          variant="description"
          label={t('drawer.description')}
          placeholder={t('drawer.descriptionPlaceholder')}
          value={task.description}
          mentions={mentions}
          onChange={(doc, editor) => {
            pending.current = editor.isEmpty ? null : resolveTypedMentions(doc, mentions);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, SAVE_DELAY);
          }}
          editorRef={editorRef}
          onBlur={() => {
            // Show the chip for a typed "@Name" once the author leaves the field.
            const editor = editorRef.current;
            if (editor) {
              const doc = editor.getJSON() as RichTextNode;
              const resolved = resolveTypedMentions(doc, mentions);
              if (resolved !== doc) editor.commands.setContent(resolved, { emitUpdate: false });
            }
            flush();
          }}
          onEscape={() => {
            // Esc leaves the editor (saving); a second Esc closes the drawer.
            (document.activeElement as HTMLElement | null)?.blur();
            return true;
          }}
        />
      </div>
      {references.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span>{t('drawer.references')}</span>
          {references.map(({ key, href }) => (
            <Link
              key={key}
              to={href}
              className="rounded-[6px] bg-chip px-1.5 font-mono text-[12px] text-accent-ink no-underline hover:underline"
            >
              {key}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
