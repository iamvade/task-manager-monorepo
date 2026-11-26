import {
  PALETTE_KEYS,
  canManageFeedbackTopics,
  feedbackTopicKey,
  feedbackTopicKeySchema,
  feedbackTopicNameSchema,
  FEEDBACK_TOPIC_KEY_MAX,
  FEEDBACK_TOPIC_NAME_MAX,
  type FeedbackTopicWithCount,
  type PaletteKey,
  type WorkspaceRole,
} from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../api/client';
import {
  useCreateFeedbackTopic,
  useDeleteFeedbackTopic,
  useFeedbackTopics,
  useUpdateFeedbackTopic,
} from '../../../api/feedback';
import { CopyIcon, MoreIcon, PlusIcon } from '../../../components/icons';
import { Button } from '../../../components/ui/Button';
import { ColorSwatches } from '../../../components/ui/ColorSwatches';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { IconButton } from '../../../components/ui/IconButton';
import { Menu } from '../../../components/ui/Menu';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TagChip } from '../../../components/ui/TagChip';
import { cn } from '../../../lib/cn';
import { toast } from '../../../stores/toast';
import { useCopyTopicLink } from '../useCopy';

const input =
  'box-border h-8 w-full rounded-[8px] border border-control bg-control px-3 text-[13px] text-default outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink';

/**
 * Feedback → Manage topics (not designed; built like Settings → Tags): the workspace's topics with
 * their link key and report count, a copy button per topic for everyone, and add / edit / delete
 * for admins and owners.
 */
export function TopicsDialog({
  open,
  onClose,
  workspaceId,
  slug,
  role,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  slug: string;
  role: WorkspaceRole;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const topics = useFeedbackTopics(open ? workspaceId : undefined);
  const canManage = canManageFeedbackTopics(role);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FeedbackTopicWithCount | null>(null);
  const remove = useDeleteFeedbackTopic(workspaceId);
  const copyLink = useCopyTopicLink(slug);

  const close = () => {
    setCreating(false);
    setEditing(null);
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={close} labelledBy={headingId} width={600}>
        <div className="flex max-h-[80vh] flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
                {t('feedback.topics.title')}
              </h2>
              <p className="m-0 text-[13px] leading-5 text-2">{t('feedback.topics.hint')}</p>
            </div>
            {canManage && (
              <Button
                size="md"
                variant="primary"
                icon={<PlusIcon size={14} />}
                disabled={creating}
                onClick={() => {
                  setCreating(true);
                  setEditing(null);
                }}
                className="flex-none"
              >
                {t('feedback.topics.new')}
              </Button>
            )}
          </div>
          {!canManage && (
            <p className="m-0 rounded-[8px] bg-subtle px-3 py-2.5 text-[13px] text-3">
              {t('feedback.topics.adminsOnly')}
            </p>
          )}
          <div className="-mx-5 min-h-0 overflow-y-auto px-5">
            {creating && (
              <TopicForm
                workspaceId={workspaceId}
                onDone={() => {
                  setCreating(false);
                }}
              />
            )}
            {topics.isError ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-2 border-t border-subtle py-3 text-[13px] text-muted"
              >
                {t('feedback.topics.loadError')}
                <Button size="sm" onClick={() => void topics.refetch()}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : !topics.data ? (
              <div className="flex flex-col gap-3 border-t border-subtle py-3" aria-hidden="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} height={28} />
                ))}
              </div>
            ) : topics.data.length === 0 ? (
              !creating && (
                <p className="m-0 border-t border-subtle py-3 text-[13px] text-muted">
                  {t('feedback.topics.empty')}
                </p>
              )
            ) : (
              <ul className="m-0 list-none pl-0">
                {topics.data.map((topic) =>
                  editing === topic.id ? (
                    <li key={topic.id}>
                      <TopicForm
                        workspaceId={workspaceId}
                        topic={topic}
                        onDone={() => {
                          setEditing(null);
                        }}
                      />
                    </li>
                  ) : (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      canManage={canManage}
                      onCopy={() => {
                        copyLink(topic);
                      }}
                      onEdit={() => {
                        setEditing(topic.id);
                        setCreating(false);
                      }}
                      onDelete={() => {
                        setDeleting(topic);
                      }}
                    />
                  ),
                )}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title={t('feedback.topics.deleteTitle', { name: deleting?.name ?? '' })}
        body={
          deleting && deleting.feedbackCount > 0
            ? t('feedback.topics.deleteBody', {
                count: deleting.feedbackCount,
                key: deleting.key,
              })
            : t('feedback.topics.deleteBodyUnused', { key: deleting?.key ?? '' })
        }
        confirmLabel={t('feedback.topics.delete')}
        tone="danger"
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          const { id, name } = deleting;
          remove.mutate(id, {
            onSuccess: () => {
              setDeleting(null);
              toast({ message: t('feedback.topics.deleted', { name }) });
            },
          });
        }}
      />
    </>
  );
}

function TopicRow({
  topic,
  canManage,
  onCopy,
  onEdit,
  onDelete,
}: {
  topic: FeedbackTopicWithCount;
  canManage: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-subtle py-2">
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <TagChip name={topic.name} color={topic.color} />
        <span className="max-w-full truncate font-mono text-[12px] text-muted">
          ?topic={topic.key}
        </span>
      </span>
      <span className="flex-none text-[12px] text-muted tabular-nums">
        {t('feedback.topics.count', { count: topic.feedbackCount })}
      </span>
      <IconButton
        label={t('feedback.topics.copyLink', { name: topic.name })}
        icon={<CopyIcon size={14} />}
        onClick={onCopy}
      />
      {canManage && (
        <Menu
          label={t('feedback.topics.actions', { name: topic.name })}
          placement="bottom-end"
          width={180}
          items={[
            { id: 'edit', label: t('feedback.topics.edit'), onSelect: onEdit },
            { type: 'separator', id: 'sep' },
            {
              id: 'delete',
              label: t('feedback.topics.delete'),
              danger: true,
              onSelect: onDelete,
            },
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label={t('feedback.topics.actions', { name: topic.name })}
              icon={<MoreIcon size={14} />}
            />
          )}
        />
      )}
    </li>
  );
}

/** Add a topic, or edit one: name, link key (follows the name until edited) and color. */
function TopicForm({
  workspaceId,
  topic,
  onDone,
}: {
  workspaceId: string;
  topic?: FeedbackTopicWithCount;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateFeedbackTopic(workspaceId);
  const update = useUpdateFeedbackTopic(workspaceId);
  const nameId = useId();
  const keyId = useId();
  const colorId = useId();
  const [name, setName] = useState(topic?.name ?? '');
  const [key, setKey] = useState(topic?.key ?? '');
  const [keyEdited, setKeyEdited] = useState(Boolean(topic));
  const [color, setColor] = useState<PaletteKey>(topic?.color ?? 'blue');
  const [nameError, setNameError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const shownKey = keyEdited ? key : name.trim() ? feedbackTopicKey(name) : '';
  const parsedName = feedbackTopicNameSchema.safeParse(name);
  const parsedKey = feedbackTopicKeySchema.safeParse(shownKey);

  function submit() {
    if (pending) return;
    if (!parsedKey.success) {
      setKeyError(t('feedback.topics.keyInvalid'));
      return;
    }
    if (!parsedName.success) return;
    const onError = (err: Error) => {
      if (err instanceof ApiError && err.code === 'TOPIC_EXISTS') {
        setNameError(t('feedback.topics.exists', { name: parsedName.data }));
      } else if (err instanceof ApiError && err.code === 'TOPIC_KEY_EXISTS') {
        setKeyError(t('feedback.topics.keyExists'));
      } else {
        toast({ message: t('feedback.topics.failed'), tone: 'danger' });
      }
    };
    if (topic) {
      const patch = {
        ...(parsedName.data !== topic.name && { name: parsedName.data }),
        ...(parsedKey.data !== topic.key && { key: parsedKey.data }),
        ...(color !== topic.color && { color }),
      };
      if (Object.keys(patch).length === 0) {
        onDone();
        return;
      }
      update.mutate(
        { topicId: topic.id, ...patch },
        {
          onSuccess: () => {
            toast({ message: t('feedback.topics.saved') });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { name: parsedName.data, key: parsedKey.data, color },
        {
          onSuccess: (created) => {
            toast({ message: t('feedback.topics.created', { name: created.name }) });
            onDone();
          },
          onError,
        },
      );
    }
  }

  return (
    <form
      aria-label={topic ? t('feedback.topics.edit') : t('feedback.topics.new')}
      className="flex flex-col gap-3 border-t border-subtle py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-[12px] font-medium text-2">
            {t('feedback.topics.nameLabel')}
          </label>
          <input
            id={nameId}
            autoFocus
            value={name}
            maxLength={FEEDBACK_TOPIC_NAME_MAX}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              if (!keyEdited) setKeyError(null);
            }}
            className={cn(input, nameError && 'border-danger')}
          />
          {nameError && (
            <span id={`${nameId}-error`} role="alert" className="text-[12px] text-danger">
              {nameError}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={keyId} className="text-[12px] font-medium text-2">
            {t('feedback.topics.keyLabel')}
          </label>
          <input
            id={keyId}
            value={shownKey}
            maxLength={FEEDBACK_TOPIC_KEY_MAX}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={keyError ? true : undefined}
            aria-describedby={`${keyId}-hint${keyError ? ` ${keyId}-error` : ''}`}
            onChange={(e) => {
              setKey(e.target.value.toLowerCase());
              setKeyEdited(true);
              setKeyError(null);
            }}
            className={cn(input, 'font-mono', keyError && 'border-danger')}
          />
          {keyError && (
            <span id={`${keyId}-error`} role="alert" className="text-[12px] text-danger">
              {keyError}
            </span>
          )}
        </div>
      </div>
      <p id={`${keyId}-hint`} className="m-0 text-[12px] leading-4 text-muted">
        {t('feedback.topics.keyHint', { key: shownKey || '…' })}
      </p>
      <div className="flex flex-col gap-1.5">
        <span id={colorId} className="text-[12px] font-medium text-2">
          {t('feedback.topics.colorLabel')}
        </span>
        <ColorSwatches
          colors={PALETTE_KEYS}
          family="tag"
          labelledBy={colorId}
          value={color}
          onChange={setColor}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!parsedName.success || !shownKey || pending}
          aria-busy={pending}
        >
          {topic ? t('feedback.topics.save') : t('common.create')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
