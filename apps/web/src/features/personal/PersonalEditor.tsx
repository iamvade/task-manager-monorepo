import { searchResultSchema, type PersonalItem, type RichTextNode } from '@kite/shared';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, toQuery } from '../../api/client';
import { useCreatePersonalItem, useUpdatePersonalItem } from '../../api/personal';
import { useCurrentWorkspace } from '../../api/workspaces';
import { RichTextEditor } from '../../components/editor/RichTextEditor';
import { CheckIcon } from '../../components/icons';
import { markErrorHandled } from '../../lib/mutationErrors';
import { personalLinkExtensions, type LinkSuggestion } from './editor/personalLinks';
import { resolveTypedLinks } from './editor/typedLinks';
import { usePersonalLinks } from './usePersonal';

const SAVE_DELAY = 800;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A note's body with `[[links]]` and autosave (800ms after the last change, and on blur and
 * unmount), like the task description. Last write wins: the note is mine alone, so the only
 * other writer is my other tab, whose saves arrive while this editor isn't focused.
 */
export function PersonalEditor({ item }: { item: PersonalItem }) {
  const { t } = useTranslation();
  const update = useUpdatePersonalItem();
  const create = useCreatePersonalItem();
  const workspace = useCurrentWorkspace();
  const { items } = usePersonalLinks();
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<RichTextNode | null | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const latest = useRef({ item, items, workspaceId: workspace?.id, mutate: update.mutate });
  useEffect(() => {
    latest.current = { item, items, workspaceId: workspace?.id, mutate: update.mutate };
  });

  /* eslint-disable react-hooks/refs -- the callbacks read `latest` later, from editor events */
  const [extensions] = useState(() =>
    personalLinkExtensions({
      getItems: () => latest.current.items.filter((i) => i.id !== latest.current.item.id),
      searchTasks: async (query) => {
        const workspaceId = latest.current.workspaceId;
        if (!workspaceId) return [];
        try {
          const res = await apiFetch(
            `/workspaces/${workspaceId}/search${toQuery({ q: query })}`,
            searchResultSchema,
          );
          return res.tasks.slice(0, 5).map((task): LinkSuggestion => ({
            type: 'task',
            taskId: task.id,
            key: task.key,
            title: task.title,
          }));
        } catch {
          return [];
        }
      },
      createItem: async (title) => {
        try {
          const created = await create.mutateAsync({ title });
          return { id: created.id, title: created.title };
        } catch {
          return null;
        }
      },
      onSuggestion: () => undefined,
    }),
  );
  /* eslint-enable react-hooks/refs */

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const doc = pending.current;
    if (doc === undefined) return;
    pending.current = undefined;
    setState('saving');
    latest.current.mutate(
      { itemId: latest.current.item.id, body: doc },
      {
        onSuccess: () => {
          setState('saved');
        },
        onError: (err) => {
          markErrorHandled(err);
          pending.current ??= doc;
          setState('error');
        },
      },
    );
  }, []);

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
    <section aria-labelledby="personal-body-h" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="personal-body-h" className="m-0 text-[13px] font-semibold text-2">
          {t('personal.item.body')}
        </h2>
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
        label={t('personal.item.body')}
        placeholder={t('personal.item.bodyPlaceholder')}
        value={item.body}
        mentions={[]}
        taskKeys={false}
        extensions={extensions}
        editorRef={editorRef}
        onChange={(doc, editor) => {
          pending.current = editor.isEmpty ? null : resolveTypedLinks(doc);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, SAVE_DELAY);
        }}
        onBlur={() => {
          // A typed "[[Title]]" becomes a link once I leave the field.
          const editor = editorRef.current;
          if (editor) {
            const doc = editor.getJSON() as RichTextNode;
            const resolved = resolveTypedLinks(doc);
            if (resolved !== doc) editor.commands.setContent(resolved, { emitUpdate: false });
          }
          flush();
        }}
        onEscape={() => {
          (document.activeElement as HTMLElement | null)?.blur();
          return true;
        }}
      />
    </section>
  );
}
