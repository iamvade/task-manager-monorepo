import type { Editor } from '@tiptap/core';

/** Inserts "@" (with a leading space when needed) so the mention suggestions open. */
export function insertMentionTrigger(editor: Editor) {
  const { from } = editor.state.selection;
  const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, '\n', '\n') : '';
  editor
    .chain()
    .focus()
    .insertContent(before && !/\s/.test(before) ? ' @' : '@')
    .run();
}
