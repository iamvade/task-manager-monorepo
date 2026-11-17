import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { usePersonalLinks } from '../usePersonal';

const attr = (value: unknown) => (typeof value === 'string' ? value : null);

const base =
  'cursor-pointer rounded-[4px] px-0.5 underline decoration-1 underline-offset-2 [.ProseMirror-selectednode_&]:outline-2 [.ProseMirror-selectednode_&]:outline-accent-ink';

/**
 * A `[[link]]` to a note or to-do in the editor: the item's current title (renames follow), or
 * the stored title, dashed, for a note not created yet. Click opens it (or creates it).
 */
export function ItemLinkView({ node }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const { resolve, itemHref, navigate, createAndOpen } = usePersonalLinks();
  const title = attr(node.attrs.title) ?? '';
  const r = resolve({ targetItemId: attr(node.attrs.id), targetTaskId: null, title });
  const live = r.kind === 'item';
  return (
    <NodeViewWrapper
      as="span"
      data-type="item-link"
      title={live ? undefined : t('personal.link.notCreatedHint')}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        if (r.kind === 'item') void navigate(itemHref(r.item.id));
        else void createAndOpen(title);
      }}
      className={cn(
        base,
        live
          ? 'font-medium text-accent-ink decoration-[var(--accent)]'
          : 'text-2 decoration-dashed decoration-[var(--text-muted)]',
      )}
    >
      {live ? r.item.title : title}
    </NodeViewWrapper>
  );
}

/** A team task in a note: its key and title, or "Unavailable" when I can't see it any more. */
export function TaskLinkView({ node }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const { resolve, taskHref, navigate } = usePersonalLinks();
  const key = attr(node.attrs.key) ?? '';
  const r = resolve({ targetItemId: null, targetTaskId: attr(node.attrs.taskId), title: key });
  return (
    <NodeViewWrapper
      as="span"
      data-type="task-link"
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        if (r.kind === 'task') void navigate(taskHref(r.task));
      }}
      className={cn(
        'rounded-[6px] bg-chip px-1 no-underline',
        r.kind === 'task' ? 'cursor-pointer' : 'cursor-default',
        '[.ProseMirror-selectednode_&]:outline-2 [.ProseMirror-selectednode_&]:outline-accent-ink',
      )}
    >
      <span
        className={cn(
          'font-mono text-[12px]',
          r.kind === 'task' ? 'text-accent-ink' : 'text-muted line-through',
        )}
      >
        {r.kind === 'task' ? r.task.key : key}
      </span>
      {r.kind === 'task' ? (
        <span className={cn('ml-1 text-[13px] text-2', r.task.closed && 'line-through')}>
          {r.task.title}
        </span>
      ) : (
        <span className="ml-1 text-[12px] text-muted">{t('personal.link.unavailable')}</span>
      )}
    </NodeViewWrapper>
  );
}
