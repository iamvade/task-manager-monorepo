import type { RichTextNode } from '@kite/shared';
import type { Editor } from '@tiptap/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateComment } from '../../../api/activity';
import { insertMentionTrigger } from '../../../components/editor/commands';
import { RichTextEditor } from '../../../components/editor/RichTextEditor';
import { PaperclipIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { IconButton } from '../../../components/ui/IconButton';
import { cn } from '../../../lib/cn';
import { toast } from '../../../stores/toast';
import { useTaskView } from '../TaskContext';

interface CommentComposerProps {
  /** Reply to this top-level comment (inline thread composer). */
  parentId?: string;
  autoFocus?: boolean;
  /** After sending, or Esc on an empty reply. */
  onDone?: () => void;
}

/**
 * Comment composer (TaskDetail.dc.html): my avatar + editor with @-mentions; footer with attach,
 * @, "⌘ Enter to send" and the Comment button. Sending appends the comment right away; on an
 * error the text comes back.
 */
export function CommentComposer({ parentId, autoFocus, onDone }: CommentComposerProps) {
  const { t } = useTranslation();
  const { task, me, mentions, upload } = useTaskView();
  const create = useCreateComment();
  const editorRef = useRef<Editor | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(true);

  function send() {
    const editor = editorRef.current;
    if (!editor || editor.isEmpty) return;
    const body = editor.getJSON() as RichTextNode;
    create.mutate(
      { taskId: task.id, body, parentId, author: me, tempId: `temp-${crypto.randomUUID()}` },
      {
        onError: () => {
          toast({ message: t('drawer.commentFailed'), tone: 'danger' });
          if (editorRef.current?.isEmpty) {
            editorRef.current.commands.setContent(body);
            setEmpty(false);
          }
        },
      },
    );
    editor.commands.clearContent();
    setEmpty(true);
    onDone?.();
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar user={me} size={24} title={null} className="mt-0.5" />
      <RichTextEditor
        variant="comment"
        className="flex-1"
        label={parentId ? t('drawer.writeReply') : t('drawer.writeComment')}
        placeholder={parentId ? t('drawer.replyPlaceholder') : t('drawer.commentPlaceholder')}
        value={null}
        mentions={mentions}
        autoFocus={autoFocus}
        editorRef={editorRef}
        onChange={(_doc, editor) => {
          setEmpty(editor.isEmpty);
        }}
        onSubmit={send}
        onEscape={() => {
          if (!parentId || !editorRef.current?.isEmpty) return false;
          onDone?.();
          return true;
        }}
        footer={
          <div className="flex items-center gap-0.5 px-1.5 pt-1 pb-1.5">
            {!parentId && (
              <>
                <IconButton
                  label={t('drawer.attachFile')}
                  title={t('drawer.attachFile')}
                  icon={<PaperclipIcon size={14} />}
                  onClick={() => fileInput.current?.click()}
                />
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) upload(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />
              </>
            )}
            <IconButton
              label={t('drawer.toolbar.mention')}
              title={t('drawer.toolbar.mention')}
              icon={<span className="text-[14px]">@</span>}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                if (editorRef.current) insertMentionTrigger(editorRef.current);
              }}
            />
            <span className="flex-1 pl-1 text-[12px] text-muted">{t('drawer.sendHint')}</span>
            {parentId && (
              <button
                type="button"
                onClick={onDone}
                className="h-[30px] rounded-[8px] border-0 bg-transparent px-2.5 text-[13px] font-medium text-2 hover:bg-hover"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="button"
              disabled={empty}
              onClick={send}
              className={cn(
                'h-[30px] rounded-[8px] border-0 bg-accent px-3 text-[13px] font-medium text-white enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {parentId ? t('drawer.reply') : t('drawer.send')}
            </button>
          </div>
        }
      />
    </div>
  );
}
