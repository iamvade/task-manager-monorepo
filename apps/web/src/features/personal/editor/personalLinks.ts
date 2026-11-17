import { titleKey, type PersonalItemKind } from '@kite/shared';
import { Extension, Node, mergeAttributes, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { ItemLinkView, TaskLinkView } from './LinkViews';
import { LinkSuggestList, type LinkSuggestHandle, type LinkSuggestProps } from './LinkSuggestList';

/** A row of the `[[` popup. */
export type LinkSuggestion =
  | { type: 'item'; id: string; title: string; kind: PersonalItemKind }
  | { type: 'create'; title: string }
  | { type: 'uncreated'; title: string }
  | { type: 'task'; taskId: string; key: string; title: string };

export interface PersonalLinkCallbacks {
  /** My notes and to-dos (read on every keystroke). */
  getItems: () => readonly { id: string; title: string; kind: PersonalItemKind }[];
  /** Team tasks of the current workspace matching `query`. */
  searchTasks: (query: string, signal: AbortSignal) => Promise<LinkSuggestion[]>;
  /** Creates a note now; resolves to it (or null when that failed). */
  createItem: (title: string) => Promise<{ id: string; title: string } | null>;
  onSuggestion: (open: boolean) => void;
}

const MAX_ITEMS = 6;
const TITLE_MAX = 200;

/** Popup rows for `query`: my items, then "Create" / "Link without creating", then team tasks. */
export async function linkSuggestions(
  query: string,
  callbacks: Pick<PersonalLinkCallbacks, 'getItems' | 'searchTasks'>,
  signal: AbortSignal,
): Promise<LinkSuggestion[]> {
  const q = titleKey(query);
  const items = callbacks.getItems();
  const matches = items
    .filter((i) => !q || titleKey(i.title).includes(q))
    .sort((a, b) => {
      const ak = titleKey(a.title);
      const bk = titleKey(b.title);
      return Number(bk.startsWith(q)) - Number(ak.startsWith(q)) || ak.localeCompare(bk);
    })
    .slice(0, MAX_ITEMS)
    .map((i): LinkSuggestion => ({ type: 'item', id: i.id, title: i.title, kind: i.kind }));
  const title = query.trim().slice(0, TITLE_MAX);
  const exact = items.some((i) => titleKey(i.title) === q);
  const fresh: LinkSuggestion[] =
    title && !exact
      ? [
          { type: 'create', title },
          { type: 'uncreated', title },
        ]
      : [];
  const tasks = q.length >= 2 ? await callbacks.searchTasks(query.trim(), signal) : [];
  return [...matches, ...fresh, ...tasks];
}

function insertLink(editor: Editor, range: Range, node: { type: string; attrs: object }) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [node, { type: 'text', text: ' ' }])
    .run();
}

/** `itemLink` / `taskLink` nodes plus the `[[` popup that inserts them. */
export function personalLinkExtensions(callbacks: PersonalLinkCallbacks) {
  const command = async (editor: Editor, range: Range, row: LinkSuggestion) => {
    if (row.type === 'task') {
      insertLink(editor, range, {
        type: 'taskLink',
        attrs: { taskId: row.taskId, key: row.key },
      });
      return;
    }
    if (row.type === 'create') {
      const created = await callbacks.createItem(row.title);
      insertLink(editor, range, {
        type: 'itemLink',
        attrs: { id: created?.id ?? null, title: created?.title ?? row.title },
      });
      return;
    }
    insertLink(editor, range, {
      type: 'itemLink',
      attrs: { id: row.type === 'item' ? row.id : null, title: row.title },
    });
  };

  const ItemLink = Node.create({
    name: 'itemLink',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        id: {
          default: null,
          // An empty `data-id` means a note not created yet.
          parseHTML: (el) => (el.getAttribute('data-id') ?? '').trim() || null,
        },
        title: { default: '', parseHTML: (el) => el.getAttribute('data-title') ?? '' },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-type="item-link"]' }];
    },
    renderHTML({ node }) {
      return [
        'span',
        mergeAttributes({
          'data-type': 'item-link',
          'data-id': String(node.attrs.id ?? ''),
          'data-title': String(node.attrs.title ?? ''),
        }),
        `[[${String(node.attrs.title ?? '')}]]`,
      ];
    },
    renderText({ node }) {
      return `[[${String(node.attrs.title ?? '')}]]`;
    },
    addNodeView() {
      return ReactNodeViewRenderer(ItemLinkView, { as: 'span' });
    },
  });

  const TaskLink = Node.create({
    name: 'taskLink',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        taskId: { default: null, parseHTML: (el) => el.getAttribute('data-task-id') },
        key: { default: '', parseHTML: (el) => el.getAttribute('data-key') ?? '' },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-type="task-link"]' }];
    },
    renderHTML({ node }) {
      return [
        'span',
        mergeAttributes({
          'data-type': 'task-link',
          'data-task-id': String(node.attrs.taskId ?? ''),
          'data-key': String(node.attrs.key ?? ''),
        }),
        String(node.attrs.key ?? ''),
      ];
    },
    renderText({ node }) {
      return String(node.attrs.key ?? '');
    },
    addNodeView() {
      return ReactNodeViewRenderer(TaskLinkView, { as: 'span' });
    },
  });

  const LinkSuggest = Extension.create({
    name: 'personalLinkSuggest',
    addProseMirrorPlugins() {
      return [
        Suggestion<LinkSuggestion, LinkSuggestion>({
          pluginKey: new PluginKey('personalLinkSuggest'),
          editor: this.editor,
          char: '[[',
          allowSpaces: true,
          allowedPrefixes: null,
          placement: 'bottom-start',
          floatingUi: { strategy: 'fixed' },
          debounce: 120,
          items: ({ query, signal }) => linkSuggestions(query, callbacks, signal),
          command: ({ editor, range, props }) => {
            void command(editor, range, props);
          },
          render: () => {
            let component: ReactRenderer<LinkSuggestHandle, LinkSuggestProps> | null = null;
            let unmount: (() => void) | undefined;
            return {
              onStart: (props) => {
                callbacks.onSuggestion(true);
                component = new ReactRenderer(LinkSuggestList, { props, editor: props.editor });
                const el = component.element;
                el.dataset.overlayKeep = '';
                el.style.zIndex = '60';
                unmount = props.mount(el);
              },
              onUpdate: (props) => {
                // Typing the closing `]]` links the exact title (or a note not created yet).
                if (props.query.endsWith(']]')) {
                  const title = props.query.slice(0, -2).trim().slice(0, TITLE_MAX);
                  if (title) {
                    const match = callbacks
                      .getItems()
                      .find((i) => titleKey(i.title) === titleKey(title));
                    void command(
                      props.editor,
                      props.range,
                      match
                        ? { type: 'item', id: match.id, title: match.title, kind: match.kind }
                        : { type: 'uncreated', title },
                    );
                    return;
                  }
                }
                component?.updateProps(props);
              },
              onKeyDown: ({ event }) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  return true;
                }
                return component?.ref?.onKeyDown(event) ?? false;
              },
              onExit: () => {
                callbacks.onSuggestion(false);
                unmount?.();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
      ];
    },
  });

  return [ItemLink, TaskLink, LinkSuggest];
}
