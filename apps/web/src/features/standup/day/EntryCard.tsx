import {
  shortName,
  type StandupBlocker,
  type StandupEntry,
  type StandupTaskRef,
} from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { MoreIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Menu, type MenuItem } from '../../../components/ui/Menu';
import { cn } from '../../../lib/cn';
import { toast } from '../../../stores/toast';
import { useDayView } from './DayContext';
import { dayHref, writeHref } from './links';
import { ReactionBar } from './ReactionBar';
import { ReplyField, ReplyThread } from './Replies';
import { TaskChip } from './TaskChip';

type SectionKind = 'yesterday' | 'today' | 'blockers';

const SECTION_STYLE: Record<SectionKind, { dot: string; label: string }> = {
  yesterday: { dot: 'bg-[color:var(--text-faint)]', label: 'text-3' },
  today: { dot: 'bg-accent', label: 'text-accent-ink' },
  blockers: { dot: 'bg-prio-urgent', label: 'text-danger-soft' },
};

/** One posted update (Standup.dc.html person card): header, three sections, footer. */
export function EntryCard({ entry }: { entry: StandupEntry }) {
  const { t } = useTranslation();
  const { day, me, clock } = useDayView();
  const navigate = useNavigate();
  const mine = entry.user.id === me.id;
  const name = shortName(entry.user.name);
  const posted = entry.postedAt ? clock(entry.postedAt) : '';
  const meta = [
    { text: entry.title, late: false },
    { text: t('standup.day.postedAt', { time: posted }), late: false },
    { text: entry.isLate ? t('standup.day.late') : null, late: true },
    { text: entry.editedAt ? t('standup.day.edited') : null, late: false },
  ].filter((part) => part.text);

  const copyLink = async () => {
    const url = `${window.location.origin}${dayHref(day.group.id, entry.date)}#entry-${entry.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: t('header.linkCopied') });
    } catch {
      toast({ message: t('drawer.copyFailed'), tone: 'danger' });
    }
  };
  const menu: MenuItem[] = [
    ...(mine && day.editable
      ? [
          {
            id: 'edit',
            label: t('standup.day.editUpdate'),
            onSelect: () => void navigate(writeHref(day.group.id)),
          },
        ]
      : []),
    { id: 'copy', label: t('standup.day.copyLink'), onSelect: () => void copyLink() },
  ];

  return (
    <article
      id={`entry-${entry.id}`}
      aria-label={name}
      className="flex scroll-mt-4 flex-col overflow-hidden rounded-[12px] border border-default"
    >
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <Avatar user={entry.user} size={36} textSize={13} title={null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-[12px] text-muted">
            {meta.map((part, i) => (
              <span key={String(i)} className={part.late ? 'text-warning' : undefined}>
                {i > 0 && ' · '}
                {part.text}
              </span>
            ))}
          </span>
        </div>
        <Menu
          label={t('standup.day.more')}
          placement="bottom-end"
          items={menu}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={t('standup.day.more')}
              className="flex size-7 items-center justify-center rounded-[6px] text-icon hover:bg-hover"
            >
              <MoreIcon size={14} />
            </button>
          )}
        />
      </header>
      <div className="flex flex-col gap-3 px-4 pb-3.5">
        <Section kind="yesterday">
          {entry.yesterday.map((item, i) => (
            <Item key={String(i)} text={item.text} task={item.task} />
          ))}
        </Section>
        <Section kind="today">
          {entry.today.map((item, i) => (
            <Item key={String(i)} text={item.text} task={item.task} />
          ))}
        </Section>
        <Section kind="blockers">
          {entry.blockers.length === 0 ? (
            <div className="pl-3 text-[14px] leading-5 text-muted">
              {t('standup.day.noBlockers')}
            </div>
          ) : (
            entry.blockers.map((b) => <BlockerItem key={b.id} blocker={b} />)
          )}
        </Section>
      </div>
      <footer className="flex flex-col gap-2.5 border-t border-subtle bg-card-footer px-4 pt-2.5 pb-3.5">
        <ReactionBar entry={entry} />
        <ReplyThread replies={entry.replies} />
        <ReplyField entryId={entry.id} to={entry.user} />
      </footer>
    </article>
  );
}

function Section({ kind, children }: { kind: SectionKind; children: ReactNode }) {
  const { t } = useTranslation();
  const style = SECTION_STYLE[kind];
  const items = Array.isArray(children) ? children : [children];
  if (kind !== 'blockers' && items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('flex items-center gap-1.5 text-[12px] font-semibold', style.label)}>
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', style.dot)} />
        {t(`standup.day.section.${kind}`)}
      </span>
      {children}
    </div>
  );
}

function Item({
  text,
  task,
  muted,
  suffix,
}: {
  text: string;
  task: StandupTaskRef | null;
  muted?: boolean;
  suffix?: string;
}) {
  // A suggestion copies the task title into `text`: the chip alone says it then.
  const same = task !== null && text.trim() === task.title.trim();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-3 text-[14px] leading-5',
        muted ? 'text-muted line-through' : 'text-body',
      )}
    >
      {!same && <span className="break-words">{text}</span>}
      {suffix && <span>{suffix}</span>}
      {task && <TaskChip task={task} />}
    </div>
  );
}

function BlockerItem({ blocker }: { blocker: StandupBlocker }) {
  const helpers = blocker.helpers.map((h) => `@${shortName(h.name)}`).join(' ');
  return (
    <Item
      text={blocker.text}
      task={blocker.task}
      muted={blocker.resolvedAt !== null}
      suffix={helpers ? `· ${helpers}` : undefined}
    />
  );
}
