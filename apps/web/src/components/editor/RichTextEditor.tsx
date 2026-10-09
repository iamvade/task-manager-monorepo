import type { RichTextNode } from '@kite/shared';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { EditorToolbar } from './EditorToolbar';
import { editorExtensions } from './extensions';
import type { MentionCandidate } from './mentions';

export interface RichTextEditorProps {
  value: RichTextNode | null;
  onChange?: (doc: RichTextNode, editor: Editor) => void;
  /** Accessible name of the text box. */
  label: string;
  placeholder: string;
  mentions: readonly MentionCandidate[];
  /** description: toolbar on top, suggestions below; comment: compact, suggestions above. */
  variant: 'description' | 'comment';
  autoFocus?: boolean;
  /** ⌘/Ctrl+Enter. */
  onSubmit?: () => void;
  /** Esc (when no suggestion is open); return true to stop it there (it won't close the drawer). */
  onEscape?: () => boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  editorRef?: MutableRefObject<Editor | null>;
  /** Rendered inside the border, under the text (composer actions). */
  footer?: ReactNode;
  className?: string;
}

const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * TipTap editor in the TaskDetail.dc.html frame: radius 10, 1px border, accent border +
 * `--ring-soft` while focused. Content follows the design's long-form type (14/22 body text).
 * An external `value` is applied only while the editor isn't focused, so refetches never
 * overwrite what the user is typing.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  mentions,
  variant,
  autoFocus,
  onSubmit,
  onEscape,
  onFocus,
  onBlur,
  editorRef,
  footer,
  className,
}: RichTextEditorProps) {
  const latest = useRef({ mentions, onSubmit, onEscape, onChange, onFocus, onBlur });
  useEffect(() => {
    latest.current = { mentions, onSubmit, onEscape, onChange, onFocus, onBlur };
  });
  const suggesting = useRef(false);

  /* eslint-disable react-hooks/refs -- the callbacks read `latest` later, from editor events */
  const editor = useEditor({
    extensions: editorExtensions(
      {
        getMentions: () => latest.current.mentions,
        onSubmit: () => {
          if (!latest.current.onSubmit) return false;
          latest.current.onSubmit();
          return true;
        },
        onSuggestion: (open) => {
          suggesting.current = open;
        },
      },
      { placeholder, placement: variant === 'comment' ? 'top-start' : 'bottom-start' },
    ),
    /* eslint-enable react-hooks/refs */
    content: value ?? '',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: cn(
          'rich-text outline-none',
          variant === 'description'
            ? 'min-h-[88px] px-4 pt-3 pb-4'
            : 'max-h-[240px] min-h-[44px] overflow-y-auto px-3 pt-2.5 pb-1',
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape' || suggesting.current) return false;
        if (latest.current.onEscape?.()) {
          event.stopPropagation();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      latest.current.onChange?.(e.getJSON() as RichTextNode, e);
    },
    onFocus: () => {
      latest.current.onFocus?.();
    },
    onBlur: () => {
      latest.current.onBlur?.();
    },
  });

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (editor.isDestroyed || editor.isFocused) return;
    if (sameDoc(editor.getJSON(), value ?? editor.schema.topNodeType.createAndFill()?.toJSON())) {
      return;
    }
    editor.commands.setContent(value ?? '', { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-[10px] border bg-surface transition-shadow focus-within:border-accent focus-within:shadow-ring-soft',
        variant === 'description' ? 'border-default' : 'border-control',
        className,
      )}
    >
      {variant === 'description' && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
      {footer}
    </div>
  );
}
