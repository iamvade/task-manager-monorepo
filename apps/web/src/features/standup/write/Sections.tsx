import { shortName, type StandupTaskRef, type UserRef, type WorkspaceMember } from '@kite/shared';
import {
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircleIcon,
  ArcIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CommentIcon,
  LinkIcon,
  PlusIcon,
} from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { cn } from '../../../lib/cn';
import { AssigneePicker } from '../../pickers/AssigneePicker';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';
import { uid, withEmptyBlocker, type Draft, type YesterdayKind } from './draft';
import { TaskLinkPicker } from './TaskLinkPicker';

type SetDraft = Dispatch<SetStateAction<Draft>>;

/**
 * desktop = the modal (StandupWrite.dc.html); mobile = the phone page
 * (StandupWriteMobile.dc.html): 44–52px rows and tap targets, 16px inputs (no iOS zoom).
 */
export type WriteVariant = 'desktop' | 'mobile';

interface SectionProps {
  draft: Draft;
  setDraft: SetDraft;
  variant?: WriteVariant;
}

const MAX_CHIPS = 8;

function Legend({
  dot,
  tone,
  label,
  hint,
  mobile,
}: {
  dot: string;
  tone: string;
  label: string;
  hint: string;
  mobile: boolean;
}) {
  return (
    <legend
      className={cn(
        'mb-2 flex items-center gap-2 p-0 font-semibold',
        mobile ? 'text-[14px] leading-[22px]' : 'text-[13px]',
        tone,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />
      {label}
      <span className={cn('font-normal text-muted', mobile && 'text-[12px]')}>
        {mobile ? hint : `· ${hint}`}
      </span>
    </legend>
  );
}

const fieldset = 'm-0 flex min-w-0 flex-col gap-2 border-0 p-0';
const removeButton = (mobile: boolean) =>
  mobile
    ? 'flex size-11 flex-none items-center justify-center rounded-full text-icon hover:bg-hover'
    : 'flex size-7 flex-none items-center justify-center rounded-[6px] text-icon hover:bg-hover';
const inputText = (mobile: boolean) => (mobile ? 'text-[16px]' : 'text-[14px]');

const KIND_STYLE: Record<Exclude<YesterdayKind, 'text'>, { tile: string; icon: ReactNode }> = {
  completed: {
    tile: 'bg-success-soft text-success-soft',
    icon: <CheckIcon size={12} strokeWidth={2.5} />,
  },
  review: { tile: 'bg-accent-soft text-accent-ink', icon: <ArrowRightIcon size={12} /> },
  commented: {
    tile: 'bg-surface-2 text-3',
    icon: <CommentIcon size={12} strokeWidth={2.5} />,
  },
};

/** Enter in an "add" field adds a row; the field clears. */
function AddField({
  label,
  boxed,
  mobile,
  onAdd,
}: {
  label: string;
  boxed?: boolean;
  mobile: boolean;
  onAdd: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 px-3',
        mobile ? 'min-h-12' : 'h-10',
        boxed
          ? cn(
              'border border-default focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent-ink',
              mobile ? 'rounded-[12px]' : 'rounded-[10px]',
            )
          : 'focus-within:bg-subtle',
      )}
    >
      {!boxed && <PlusIcon size={mobile ? 16 : 14} className="flex-none text-icon" />}
      <span className="sr-only">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={500}
        placeholder={label}
        enterKeyHint="enter"
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (value.trim()) onAdd(value.trim());
            setValue('');
          }
        }}
        onBlur={() => {
          if (value.trim()) onAdd(value.trim());
          setValue('');
        }}
        className={cn(
          'min-w-0 flex-1 border-0 bg-transparent p-0 text-default outline-none placeholder:text-muted',
          inputText(mobile),
        )}
      />
    </label>
  );
}

/** A free-text row: edit in place; ⌫ on an empty row removes it. */
function TextRowInput({
  value,
  label,
  mobile,
  onChange,
  onRemove,
}: {
  value: string;
  label: string;
  mobile: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && value === '') {
      e.preventDefault();
      onRemove();
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.preventDefault();
  };
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      maxLength={500}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onKeyDown={onKeyDown}
      className={cn(
        'min-w-0 flex-1 border-0 bg-transparent p-0 text-default outline-none',
        inputText(mobile),
      )}
    />
  );
}

function TaskLink({ task, mobile }: { task: StandupTaskRef; mobile: boolean }) {
  const href = useTaskKeyHref()(task.key);
  // Inside the modal, a task opens on its own page in a new tab (the drawer sits under it).
  const className = cn(
    'min-w-0 font-medium text-default no-underline hover:underline',
    mobile ? 'text-[14px] leading-5 break-words' : 'truncate',
  );
  return href ? (
    <a href={`/t/${task.key}`} target="_blank" rel="noreferrer" className={className}>
      {task.title}
    </a>
  ) : (
    <span className={className}>{task.title}</span>
  );
}

export function YesterdayFieldset({ draft, setDraft, variant = 'desktop' }: SectionProps) {
  const { t } = useTranslation();
  const mobile = variant === 'mobile';
  const remove = (rowUid: string) => {
    setDraft((d) => {
      const row = d.yesterday.find((r) => r.uid === rowUid);
      return {
        ...d,
        yesterday: d.yesterday.filter((r) => r.uid !== rowUid),
        removed: row && row.kind !== 'text' ? [...d.removed, row] : d.removed,
      };
    });
  };
  return (
    <fieldset className={fieldset}>
      <Legend
        dot="bg-[color:var(--text-faint)]"
        tone="text-2"
        label={t('standup.write.yesterday')}
        hint={mobile ? t('standup.write.suggestedShort') : t('standup.write.suggested')}
        mobile={mobile}
      />
      <div
        className={cn(
          'flex flex-col overflow-hidden border border-subtle',
          mobile ? 'rounded-[12px]' : 'rounded-[10px]',
        )}
      >
        {draft.yesterday.map((row) => (
          <div
            key={row.uid}
            className={cn(
              'flex items-center gap-2.5 border-b border-[color:var(--surface-2)]',
              mobile ? 'min-h-[52px] py-1 pr-1 pl-3' : 'min-h-10 py-1.5 pr-1.5 pl-3',
            )}
          >
            {row.kind === 'text' ? (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex flex-none items-center justify-center bg-surface-2 text-icon',
                    mobile ? 'size-6 rounded-[7px]' : 'size-[22px] rounded-[6px]',
                  )}
                >
                  <span className="size-1 rounded-full bg-current" />
                </span>
                <TextRowInput
                  value={row.text}
                  label={t('standup.write.yesterdayItem')}
                  mobile={mobile}
                  onChange={(text) => {
                    setDraft((d) => ({
                      ...d,
                      yesterday: d.yesterday.map((r) => (r.uid === row.uid ? { ...r, text } : r)),
                    }));
                  }}
                  onRemove={() => {
                    remove(row.uid);
                  }}
                />
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex flex-none items-center justify-center',
                    mobile ? 'size-6 rounded-[7px]' : 'size-[22px] rounded-[6px]',
                    KIND_STYLE[row.kind].tile,
                  )}
                >
                  {KIND_STYLE[row.kind].icon}
                </span>
                <span
                  className={cn(
                    'flex min-w-0 flex-1',
                    mobile ? 'flex-col' : 'flex-wrap items-center gap-x-2 gap-y-1',
                  )}
                >
                  <span className={cn('text-[12px] text-muted', mobile && 'leading-4')}>
                    {t(`standup.write.kind.${row.kind}`)}
                  </span>
                  {row.task ? (
                    <TaskLink task={row.task} mobile={mobile} />
                  ) : (
                    <span>{row.text}</span>
                  )}
                </span>
              </>
            )}
            <button
              type="button"
              aria-label={t('standup.write.remove', { title: row.task?.title ?? row.text })}
              onClick={() => {
                remove(row.uid);
              }}
              className={removeButton(mobile)}
            >
              <CloseIcon size={mobile ? 16 : 13} strokeWidth={2.25} />
            </button>
          </div>
        ))}
        <AddField
          label={t('standup.write.addYesterday')}
          mobile={mobile}
          onAdd={(text) => {
            setDraft((d) => ({
              ...d,
              yesterday: [...d.yesterday, { uid: uid(), kind: 'text', task: null, text }],
            }));
          }}
        />
      </div>
      {draft.more.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setDraft((d) => ({ ...d, yesterday: [...d.yesterday, ...d.more], more: [] }));
          }}
          className={cn(
            'self-start border-0 bg-transparent p-0 text-[12px] font-medium text-accent-ink hover:underline',
            mobile ? 'min-h-11' : 'h-6',
          )}
        >
          {t('standup.write.moreSuggestions', { count: draft.more.length })}
        </button>
      )}
      {draft.removed.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setDraft((d) => ({ ...d, yesterday: [...d.yesterday, ...d.removed], removed: [] }));
          }}
          className={cn(
            'self-start border-0 bg-transparent p-0 text-[12px] font-medium text-accent-ink hover:underline',
            mobile ? 'min-h-11' : 'h-6',
          )}
        >
          {t('standup.write.restore', { count: draft.removed.length })}
        </button>
      )}
    </fieldset>
  );
}

const TAG_STYLE = {
  overdue: { icon: <AlertCircleIcon size={12} />, tone: 'text-danger-soft' },
  due_today: { icon: <ClockIcon size={12} strokeWidth={2.5} />, tone: 'text-due-today' },
  in_progress: { icon: <ArcIcon size={12} />, tone: 'text-muted' },
} as const;

export function TodayFieldset({ draft, setDraft, variant = 'desktop' }: SectionProps) {
  const { t } = useTranslation();
  const mobile = variant === 'mobile';
  const [showAll, setShowAll] = useState(false);
  const chips = showAll ? draft.chips : draft.chips.slice(0, MAX_CHIPS);
  const more = draft.chips.length - chips.length;
  return (
    <fieldset className={fieldset}>
      <Legend
        dot="bg-accent"
        tone="text-accent-ink"
        label={t('standup.write.today')}
        hint={t('standup.write.tapToAdd')}
        mobile={mobile}
      />
      {draft.chips.length > 0 && (
        <div className={cn('flex flex-wrap', mobile ? 'gap-2' : 'gap-1.5')}>
          {chips.map(({ task, tag }) => {
            const on = draft.picked.includes(task.id);
            return (
              <button
                key={task.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDraft((d) => ({
                    ...d,
                    picked: on ? d.picked.filter((id) => id !== task.id) : [...d.picked, task.id],
                  }));
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 border font-medium',
                  mobile
                    ? 'min-h-10 rounded-[20px] py-1.5 pr-3 pl-2.5 text-left text-[14px] leading-5'
                    : 'h-[30px] max-w-[300px] rounded-[15px] pr-2.5 pl-2 text-[13px]',
                  on
                    ? 'border-accent bg-accent-soft text-default'
                    : 'border-default bg-surface text-2 hover:bg-subtle',
                )}
              >
                {on ? (
                  <CheckIcon size={mobile ? 14 : 12} strokeWidth={2.5} className="flex-none" />
                ) : (
                  <PlusIcon size={mobile ? 14 : 12} strokeWidth={2.5} className="flex-none" />
                )}
                <span className={mobile ? 'min-w-0 break-words' : 'truncate'}>{task.title}</span>
                {tag && (
                  // The phone layout leaves the tag out visually (design); it's still read.
                  <span
                    className={cn(
                      'flex-none text-[11px] font-medium',
                      TAG_STYLE[tag].tone,
                      mobile && 'sr-only',
                    )}
                  >
                    {t(`standup.write.tag.${tag}`)}
                  </span>
                )}
              </button>
            );
          })}
          {more > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowAll(true);
              }}
              className={cn(
                'inline-flex items-center px-2.5 font-medium text-3 hover:bg-hover',
                mobile
                  ? 'min-h-10 rounded-[20px] text-[14px]'
                  : 'h-[30px] rounded-[15px] text-[13px]',
              )}
            >
              {t('standup.write.moreChips', { count: more })}
            </button>
          )}
        </div>
      )}
      {draft.today.map((row) => (
        <div
          key={row.uid}
          className={cn(
            'flex items-center gap-2.5 border border-default pl-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent-ink',
            mobile ? 'min-h-12 rounded-[12px] pr-0.5' : 'h-10 rounded-[10px] pr-1.5',
          )}
        >
          <TextRowInput
            value={row.text}
            label={t('standup.write.todayItem')}
            mobile={mobile}
            onChange={(text) => {
              setDraft((d) => ({
                ...d,
                today: d.today.map((r) => (r.uid === row.uid ? { ...r, text } : r)),
              }));
            }}
            onRemove={() => {
              setDraft((d) => ({ ...d, today: d.today.filter((r) => r.uid !== row.uid) }));
            }}
          />
          <button
            type="button"
            aria-label={t('standup.write.remove', { title: row.text })}
            onClick={() => {
              setDraft((d) => ({ ...d, today: d.today.filter((r) => r.uid !== row.uid) }));
            }}
            className={removeButton(mobile)}
          >
            <CloseIcon size={mobile ? 16 : 13} strokeWidth={2.25} />
          </button>
        </div>
      ))}
      <AddField
        boxed
        mobile={mobile}
        label={mobile ? t('standup.write.addTodayShort') : t('standup.write.addToday')}
        onAdd={(text) => {
          setDraft((d) => ({ ...d, today: [...d.today, { uid: uid(), text }] }));
        }}
      />
    </fieldset>
  );
}

export function BlockersFieldset({
  draft,
  setDraft,
  variant = 'desktop',
  suggestedTasks,
  members,
}: SectionProps & {
  suggestedTasks: readonly StandupTaskRef[];
  /** Group members other than me (who can help). */
  members: readonly WorkspaceMember[];
}) {
  const { t } = useTranslation();
  const mobile = variant === 'mobile';
  const edit = (rowUid: string, patch: Partial<Draft['blockers'][number]>) => {
    setDraft((d) => ({
      ...d,
      blockers: d.blockers.map((b) => (b.uid === rowUid ? { ...b, ...patch } : b)),
    }));
  };
  const last = draft.blockers.at(-1);
  return (
    <fieldset className={fieldset}>
      <Legend
        dot="bg-prio-urgent"
        tone="text-danger-soft"
        label={t('standup.write.blockers')}
        hint={t('standup.write.optional')}
        mobile={mobile}
      />
      {draft.blockers.map((b, index) => {
        const linkPicker = (
          <TaskLinkPicker
            suggested={suggestedTasks}
            value={b.task}
            onChange={(task) => {
              edit(b.uid, { task });
            }}
            onClear={
              mobile
                ? () => {
                    edit(b.uid, { task: null });
                  }
                : undefined
            }
            trigger={(props, open) =>
              mobile ? (
                <button
                  {...props}
                  type="button"
                  aria-pressed={b.task !== null}
                  aria-label={
                    b.task
                      ? `${t('standup.write.linkTask')}: ${b.task.title}`
                      : t('standup.write.linkTask')
                  }
                  className={cn(mobileAction(b.task !== null), open && 'border-strong')}
                >
                  <LinkIcon size={14} className="flex-none" />
                  <span className="truncate">{b.task?.title ?? t('standup.write.linkTask')}</span>
                </button>
              ) : (
                <button
                  {...props}
                  type="button"
                  aria-pressed={b.task !== null}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-2 hover:bg-hover',
                    open && 'bg-hover',
                  )}
                >
                  <LinkIcon size={13} />
                  {t('standup.write.linkTask')}
                </button>
              )
            }
          />
        );
        const helpers = b.helpers.map((h) => `@${shortName(h.name)}`);
        const helperPicker = (
          <AssigneePicker
            value={b.helpers}
            members={members}
            label={t('standup.write.whoCanHelp')}
            searchPlaceholder={t('standup.write.searchPeople')}
            pickedLabel={t('standup.write.canHelp')}
            onChange={(next: UserRef[]) => {
              edit(b.uid, { helpers: next.slice(0, 10) });
            }}
            trigger={(props, open) =>
              mobile ? (
                <button
                  {...props}
                  type="button"
                  aria-pressed={b.helpers.length > 0}
                  aria-label={
                    helpers.length > 0
                      ? `${t('standup.write.whoCanHelp')}: ${helpers.join(', ')}`
                      : t('standup.write.whoCanHelp')
                  }
                  className={cn(mobileAction(helpers.length > 0), open && 'border-strong')}
                >
                  {helpers.length === 0 && <span aria-hidden="true">@</span>}
                  <span className="truncate">
                    {helpers.length === 0
                      ? t('standup.write.whoCanHelp')
                      : helpers.length === 1
                        ? helpers[0]
                        : `${helpers[0] ?? ''} +${String(helpers.length - 1)}`}
                  </span>
                </button>
              ) : (
                <button
                  {...props}
                  type="button"
                  aria-pressed={b.helpers.length > 0}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-2 hover:bg-hover',
                    open && 'bg-hover',
                  )}
                >
                  <span aria-hidden="true" className="text-[13px]">
                    @
                  </span>
                  {t('standup.write.whoCanHelp')}
                </button>
              )
            }
          />
        );
        return (
          <div
            key={b.uid}
            className={cn(
              'flex flex-col gap-2 border border-default focus-within:border-strong',
              mobile ? 'rounded-[12px] pt-1 pr-2 pb-2 pl-3' : 'rounded-[10px] py-2 pr-2 pl-3',
            )}
          >
            <label className={cn('flex items-center', mobile && 'min-h-11')}>
              <span className="sr-only">{t('standup.write.blockerLabel', { n: index + 1 })}</span>
              <input
                type="text"
                value={b.text}
                maxLength={500}
                placeholder={t('standup.write.blockerPlaceholder')}
                onChange={(e) => {
                  edit(b.uid, { text: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.preventDefault();
                  if (e.key === 'Backspace' && b.text === '' && draft.blockers.length > 1) {
                    e.preventDefault();
                    setDraft((d) => ({
                      ...d,
                      blockers: d.blockers.filter((x) => x.uid !== b.uid),
                    }));
                  }
                }}
                className={cn(
                  'min-w-0 flex-1 border-0 bg-transparent p-0 text-default outline-none placeholder:text-muted',
                  mobile ? 'text-[16px]' : 'h-7 text-[14px]',
                )}
              />
            </label>
            {mobile ? (
              <div className="flex gap-2">
                {linkPicker}
                {helperPicker}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {b.task && (
                  <span className="inline-flex h-[26px] max-w-[280px] items-center gap-1.5 rounded-[6px] border border-default pr-1 pl-2 text-[12px]">
                    <ProjectDot color={b.task.project.color} size={7} />
                    <span className="truncate">{b.task.title}</span>
                    <button
                      type="button"
                      aria-label={t('standup.write.unlink')}
                      onClick={() => {
                        edit(b.uid, { task: null });
                      }}
                      className="flex size-5 flex-none items-center justify-center rounded-[4px] text-icon hover:bg-hover"
                    >
                      <CloseIcon size={10} strokeWidth={3} />
                    </button>
                  </span>
                )}
                {b.helpers.map((h) => (
                  <HelperPill
                    key={h.id}
                    user={h}
                    onRemove={() => {
                      edit(b.uid, { helpers: b.helpers.filter((x) => x.id !== h.id) });
                    }}
                  />
                ))}
                <span className="flex-1" />
                {linkPicker}
                {helperPicker}
              </div>
            )}
          </div>
        );
      })}
      {last && last.text.trim() !== '' && draft.blockers.length < 10 && (
        <button
          type="button"
          onClick={() => {
            setDraft((d) => ({ ...d, blockers: [...d.blockers, withEmptyBlocker()] }));
          }}
          className={cn(
            'inline-flex items-center gap-1 self-start border-0 bg-transparent p-0 text-[12px] font-medium text-accent-ink hover:underline',
            mobile ? 'min-h-11' : 'h-6',
          )}
        >
          <PlusIcon size={12} />
          {t('standup.write.addBlocker')}
        </button>
      )}
    </fieldset>
  );
}

/** Phone: "Link a task" / "Who can help" as two equal 44px outline buttons. */
const mobileAction = (on: boolean) =>
  cn(
    'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-2 text-[13px] font-medium',
    on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-default bg-surface text-2',
  );

function HelperPill({ user, onRemove }: { user: UserRef; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-[13px] bg-accent-soft pr-1 pl-[3px] text-[12px] font-semibold text-accent-ink">
      <Avatar user={user} size={20} textSize={10} title={null} />@{shortName(user.name)}
      <button
        type="button"
        aria-label={t('standup.write.unmention', { name: shortName(user.name) })}
        onClick={onRemove}
        className="flex size-5 items-center justify-center rounded-full text-current hover:bg-hover"
      >
        <CloseIcon size={10} strokeWidth={3} />
      </button>
    </span>
  );
}
