import { Extension, mergeAttributes } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import { ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { MentionList, type MentionListHandle, type MentionListProps } from './MentionList';
import { filterMentions, type MentionCandidate } from './mentions';

export interface EditorCallbacks {
  /** Current @-suggestion candidates (read on every keystroke, so they can change). */
  getMentions: () => readonly MentionCandidate[];
  /** ⌘/Ctrl+Enter; return true when handled. */
  onSubmit: () => boolean;
  /** The @-suggestion popup opened or closed. */
  onSuggestion: (open: boolean) => void;
}

const labelOf = (attrs: Record<string, unknown>) =>
  typeof attrs.label === 'string' ? attrs.label : '';

/**
 * The editor setup shared by the description and comments: paragraphs, h3/h4, lists, bold,
 * italic, strike, inline code, links, markdown input rules (StarterKit), a placeholder, and
 * `mention` nodes with `attrs { id, label }` (what the API reads mentions from).
 */
export function editorExtensions(
  callbacks: EditorCallbacks,
  { placeholder, placement }: { placeholder: string; placement: 'top-start' | 'bottom-start' },
) {
  return [
    StarterKit.configure({
      heading: { levels: [3, 4] },
      codeBlock: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    Placeholder.configure({ placeholder }),
    Mention.configure({
      renderText: ({ node }) => `@${labelOf(node.attrs)}`,
      renderHTML: ({ node }) => [
        'span',
        mergeAttributes({
          'data-type': 'mention',
          'data-id': String(node.attrs.id ?? ''),
          class: 'mention',
        }),
        `@${labelOf(node.attrs)}`,
      ],
      suggestion: {
        char: '@',
        placement,
        floatingUi: { strategy: 'fixed' },
        items: ({ query }) => filterMentions(callbacks.getMentions(), query),
        render: () => {
          let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
          let unmount: (() => void) | undefined;
          return {
            onStart: (props) => {
              callbacks.onSuggestion(true);
              component = new ReactRenderer(MentionList, { props, editor: props.editor });
              const el = component.element;
              el.dataset.overlayKeep = '';
              el.style.zIndex = '60';
              unmount = props.mount(el);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                // Closes the suggestion only, not the drawer around the editor.
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
      },
    }),
    Extension.create({
      name: 'kiteKeys',
      // Above StarterKit's HardBreak, which also binds Mod-Enter.
      priority: 1000,
      addKeyboardShortcuts() {
        return { 'Mod-Enter': () => callbacks.onSubmit() };
      },
    }),
  ];
}
