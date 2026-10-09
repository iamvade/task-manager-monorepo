import { shortName, type CommentReply, type RichTextNode } from '@kite/shared';
import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTempComment, useDeleteComment, useUpdateComment } from '../../../api/activity';
import { RichTextEditor } from '../../../components/editor/RichTextEditor';
import { RichTextView } from '../../../components/editor/RichTextView';
import { MoreIcon, PencilIcon, TrashIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { IconButton } from '../../../components/ui/IconButton';
import { Menu, type MenuItem } from '../../../components/ui/Menu';
import { cn } from '../../../lib/cn';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { canModerate, useTaskView } from '../TaskContext';

interface CommentItemProps {
  comment: CommentReply;
  /** Replies of a top-level comment (collapsed behind "1 reply"). */
  replies?: readonly CommentReply[];
  repliesOpen?: boolean;
  onToggleReplies?: () => void;
  onReply?: () => void;
}

function EditComment({ comment, onDone }: { comment: CommentReply; onDone: () => void }) {
  const { t } = useTranslation();
  const { task, mentions } = useTaskView();
  const update = useUpdateComment();
  const editorRef = useRef<Editor | null>(null);

  function save() {
    const editor = editorRef.current;
    if (!editor || editor.isEmpty) return;
    update.mutate({
      taskId: task.id,
      commentId: comment.id,
      body: editor.getJSON() as RichTextNode,
    });
    onDone();
  }

  return (
    <RichTextEditor
      variant="comment"
      label={t('drawer.editComment')}
      placeholder={t('drawer.commentPlaceholder')}
      value={comment.body}
      mentions={mentions}
      autoFocus
      editorRef={editorRef}
      onSubmit={save}
      onEscape={() => {
        onDone();
        return true;
      }}
      footer={
        <div className="flex items-center justify-end gap-1 px-1.5 pt-1 pb-1.5">
          <button
            type="button"
            onClick={onDone}
            className="h-[30px] rounded-[8px] border-0 bg-transparent px-2.5 text-[13px] font-medium text-2 hover:bg-hover"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className="h-[30px] rounded-[8px] border-0 bg-accent px-3 text-[13px] font-medium text-white hover:brightness-110"
          >
            {t('drawer.saveComment')}
          </button>
        </div>
      }
    />
  );
}

/**
 * A comment (TaskDetail.dc.html): 24px avatar + bordered bubble (radius 10) with name, time,
 * "…" (edit for the author, delete for the author or an admin), the body with mention chips,
 * Reply and the "1 reply" thread toggle.
 */
export function CommentItem({
  comment,
  replies,
  repliesOpen,
  onToggleReplies,
  onReply,
}: CommentItemProps) {
  const { t } = useTranslation();
  const { task, me, role } = useTaskView();
  const { ago } = useRelativeTime();
  const remove = useDeleteComment();
  const [editing, setEditing] = useState(false);
  const temp = isTempComment(comment);
  const own = comment.author.id === me.id;
  const deleted = comment.deletedAt !== null || comment.body === null;
  const root = useRef<HTMLDivElement>(null);

  // A comment just sent from the composer scrolls into view.
  useEffect(() => {
    if (temp) root.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [temp]);

  const items: MenuItem[] = [
    ...(own
      ? [
          {
            id: 'edit',
            label: t('drawer.editComment'),
            icon: <PencilIcon size={14} />,
            onSelect: () => {
              setEditing(true);
            },
          },
        ]
      : []),
    ...(own || canModerate(role)
      ? [
          {
            id: 'delete',
            label: t('table.delete'),
            icon: <TrashIcon size={14} />,
            danger: true,
            onSelect: () => {
              if (window.confirm(t('drawer.deleteCommentConfirm'))) {
                remove.mutate({ taskId: task.id, commentId: comment.id });
              }
            },
          },
        ]
      : []),
  ];

  return (
    <div ref={root} className="flex scroll-mb-36 items-start gap-2.5 py-2">
      <Avatar user={comment.author} size={24} title={null} />
      {editing && comment.body ? (
        <div className="min-w-0 flex-1">
          <EditComment
            comment={comment}
            onDone={() => {
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-1.5 rounded-[10px] border border-default bg-surface px-3 py-2.5',
            temp && 'opacity-70',
          )}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <strong className="font-semibold">{shortName(comment.author.name)}</strong>
            <time dateTime={comment.createdAt} className="text-[12px] text-muted">
              {ago(comment.createdAt)}
            </time>
            {comment.editedAt && !deleted && (
              <span className="text-[12px] text-faint">{t('drawer.edited')}</span>
            )}
            <span className="flex-1" />
            {!temp && !deleted && items.length > 0 && (
              <Menu
                label={t('drawer.commentOptions')}
                placement="bottom-end"
                width={180}
                items={items}
                trigger={(props, open) => (
                  <IconButton
                    {...props}
                    label={t('drawer.commentOptions')}
                    size={24}
                    icon={<MoreIcon size={14} />}
                    className={cn('text-icon', open && 'bg-hover')}
                  />
                )}
              />
            )}
          </div>
          {deleted ? (
            <p className="m-0 text-[14px] leading-[22px] text-muted italic">
              {t('drawer.commentDeleted')}
            </p>
          ) : (
            comment.body && <RichTextView doc={comment.body} />
          )}
          {!temp && (Boolean(onReply) || Boolean(replies?.length)) && (
            <div className="flex gap-3 text-[12px]">
              {onReply && !deleted && (
                <button
                  type="button"
                  onClick={onReply}
                  className="-ml-1.5 h-6 rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] text-3 hover:bg-hover"
                >
                  {t('drawer.reply')}
                </button>
              )}
              {replies && replies.length > 0 && (
                <button
                  type="button"
                  aria-expanded={repliesOpen}
                  onClick={onToggleReplies}
                  className="h-6 rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] text-muted hover:bg-hover"
                >
                  {repliesOpen
                    ? t('drawer.hideReplies')
                    : t('drawer.replies', { count: replies.length })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
