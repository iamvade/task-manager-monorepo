import { splitTaskKeys } from '@kite/shared';
import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Attribute on decorated task keys; the description opens them on ⌘/Ctrl-click. */
export const TASK_REF_ATTR = 'data-task-ref';

function decorate(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((m) => m.type.name === 'code' || m.type.name === 'link')) return;
    let offset = 0;
    for (const part of splitTaskKeys(node.text)) {
      if ('key' in part) {
        decorations.push(
          Decoration.inline(pos + offset, pos + offset + part.text.length, {
            class: 'task-key-link',
            [TASK_REF_ATTR]: part.key,
          }),
        );
      }
      offset += part.text.length;
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Styles `KEY-123` in the editor like a link without changing the document (the API reads keys
 * from the plain text; see task_references).
 */
export const TaskKeys = Extension.create({
  name: 'kiteTaskKeys',
  addProseMirrorPlugins() {
    const key = new PluginKey('kiteTaskKeys');
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => decorate(doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state) as DecorationSet | undefined;
          },
        },
      }),
    ];
  },
});
