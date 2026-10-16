import { shortName, type StandupReply, type UserRef } from '@kite/shared';
import { FloatingPortal, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateReply, useDeleteReply, useUpdateReply } from '../../../api/standups';
import { MoreIcon } from '../../../components/icons';
import { MentionList, type MentionListHandle } from '../../../components/editor/MentionList';
import { filterMentions, type MentionCandidate } from '../../../components/editor/mentions';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Menu } from '../../../components/ui/Menu';
import { reportError } from '../../../lib/mutationErrors';
import { firstName, useDayView } from './DayContext';

/** Replies (Standup.dc.html card footer): 22px avatar, bold name + time, 13/18 text. */
export function ReplyThread({ replies }: { replies: readonly StandupReply[] }) {
  if (replies.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {replies.map((r) => (
        <ReplyItem key={r.id} reply={r} />
      ))}
    </ul>
  );
}

function ReplyItem({ reply }: { reply: StandupReply }) {
  const { t } = useTranslation();
  const { me, day, clock } = useDayView();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const update = useUpdateReply(day.group.id);
  const remove = useDeleteReply(day.group.id);
  const mine = reply.author.id === me.id;
  return (
    <li className="group flex items-start gap-2">
      <Avatar user={reply.author} size={22} title={null} className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col text-[13px] leading-[18px]">
        <span>
          <strong className="font-semibold">{shortName(reply.author.name)}</strong>{' '}
          <span className="text-[12px] text-muted">
            {clock(reply.createdAt)}
            {reply.editedAt && ` · ${t('standup.day.edited')}`}
          </span>
        </span>
        {editing ? (
          <ReplyInput
            initial={reply.body}
            initialMentions={reply.mentions}
            label={t('standup.day.editReply')}
            placeholder={t('standup.day.editReply')}
            autoFocus
            pending={update.isPending}
            onCancel={() => {
              setEditing(false);
            }}
            onSubmit={(body, mentionIds) =>
              update.mutateAsync({ replyId: reply.id, body: { body, mentionIds } }).then(() => {
                setEditing(false);
              })
            }
          />
        ) : (
          <span className="break-words whitespace-pre-wrap text-2">{reply.body}</span>
        )}
      </div>
      {mine && !editing && (
        <Menu
          label={t('standup.day.replyActions')}
          placement="bottom-end"
          items={[
            {
              id: 'edit',
              label: t('standup.day.editReply'),
              onSelect: () => {
                setEditing(true);
              },
            },
            {
              id: 'delete',
              label: t('standup.day.deleteReply'),
              danger: true,
              onSelect: () => {
                setConfirming(true);
              },
            },
          ]}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={t('standup.day.replyActions')}
              className="flex size-6 flex-none items-center justify-center rounded-[6px] text-icon opacity-0 group-hover:opacity-100 hover:bg-hover focus-visible:opacity-100 aria-expanded:opacity-100"
            >
              <MoreIcon size={14} />
            </button>
          )}
        />
      )}
      <ConfirmDialog
        open={confirming}
        title={t('standup.day.deleteReplyTitle')}
        body={t('standup.day.deleteReplyBody')}
        confirmLabel={t('standup.day.deleteReply')}
        tone="danger"
        pending={remove.isPending}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          remove.mutate(reply.id, {
            onSuccess: () => {
              setConfirming(false);
            },
          });
        }}
      />
    </li>
  );
}

/** The 32px reply field under a card or a blocker ("Reply to Temuulen…"). */
export function ReplyField({
  entryId,
  blockerId,
  to,
}: {
  entryId: string;
  blockerId?: string;
  to: UserRef;
}) {
  const { t } = useTranslation();
  const { day, me } = useDayView();
  const create = useCreateReply(day.group.id);
  const name = firstName(to);
  const placeholder =
    to.id === me.id ? t('standup.day.replyOwn') : t('standup.day.replyTo', { name });
  return (
    <ReplyInput
      label={t('standup.day.reply')}
      placeholder={placeholder}
      pending={create.isPending}
      onSubmit={(body, mentionIds) =>
        create.mutateAsync({
          entryId,
          body: { body, mentionIds, ...(blockerId ? { blockerId } : {}) },
        })
      }
    />
  );
}

/** "@Bat" right before the caret: the query of the open @-popup. */
const MENTION_QUERY = /(?:^|\s)@([\p{L}\p{N}_.]*)$/u;

function ReplyInput({
  label,
  placeholder,
  initial = '',
  initialMentions = [],
  autoFocus,
  pending,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  initial?: string;
  initialMentions?: readonly UserRef[];
  autoFocus?: boolean;
  pending: boolean;
  onSubmit: (body: string, mentionIds: string[]) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { day, me } = useDayView();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [caret, setCaret] = useState(initial.length);
  const [dismissed, setDismissed] = useState(false);
  const [picked, setPicked] = useState<readonly UserRef[]>(initialMentions);
  const list = useRef<MentionListHandle>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const { floatingStyles, context } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  // Stable callback refs from floating-ui (plain functions, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setReference, setFloating } = context.refs;

  // Group members other than me, with their job title as the hint.
  const candidates: MentionCandidate[] = day.members
    .filter((m) => m.user.id !== me.id)
    .map((m) => ({ ...m.user, hint: m.title }));
  const query = dismissed ? null : (MENTION_QUERY.exec(value.slice(0, caret))?.[1] ?? null);
  const items = query === null ? [] : filterMentions(candidates, query);
  const open = items.length > 0;

  const pick = ({ id, label: inserted }: { id: string; label: string }) => {
    const before = value.slice(0, caret).replace(/@[\p{L}\p{N}_.]*$/u, `@${inserted} `);
    const next = before + value.slice(caret);
    const user = candidates.find((c) => c.id === id);
    if (user && !picked.some((p) => p.id === id)) setPicked([...picked, user]);
    setValue(next);
    setCaret(before.length);
    requestAnimationFrame(() => {
      input.current?.setSelectionRange(before.length, before.length);
    });
  };

  // Picked people whose "@Name" is still in the text, plus typed "@Name"s never picked.
  const mentionIds = (body: string) => {
    const ids = new Set<string>();
    for (const c of [...picked, ...candidates]) {
      if (body.includes(`@${shortName(c.name)}`) || body.includes(`@${c.name}`)) ids.add(c.id);
    }
    return [...ids];
  };

  const submit = () => {
    const body = value.trim();
    if (!body || pending) return;
    onSubmit(body, mentionIds(body)).then(
      () => {
        setValue('');
        setPicked([]);
      },
      (err: unknown) => {
        reportError(err, t('standup.day.replyFailed'));
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && list.current?.onKeyDown(e.nativeEvent)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
        return;
      }
      if (onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      return;
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <label
        ref={setReference}
        className="box-border flex h-8 items-center gap-2 rounded-[8px] border border-default bg-surface px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent-ink"
      >
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={value}
          maxLength={2000}
          placeholder={placeholder}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setDismissed(false);
          }}
          onSelect={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setDismissed(true);
          }}
          onFocus={() => {
            setDismissed(false);
          }}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-default outline-none placeholder:text-muted"
        />
      </label>
      {open && (
        <FloatingPortal>
          <div ref={setFloating} id={listId} style={floatingStyles} className="z-50">
            <MentionList ref={list} items={items} command={pick} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
