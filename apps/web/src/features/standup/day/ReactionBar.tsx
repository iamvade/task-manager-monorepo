import {
  shortName,
  STANDUP_REACTIONS,
  type StandupEntry,
  type StandupReaction,
} from '@kite/shared';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggleReaction } from '../../../api/standups';
import { EyeIcon, HeartIcon, SmileIcon, ThumbsUpIcon } from '../../../components/icons';
import { Popover } from '../../../components/ui/Popover';
import { Tooltip } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/cn';
import { useDayView } from './DayContext';

const ICONS: Record<StandupReaction, ComponentType<{ size?: number }>> = {
  thumbs_up: ThumbsUpIcon,
  eyes: EyeIcon,
  heart: HeartIcon,
};

/**
 * Reaction pills (Standup.dc.html): 26px, the ones with a count, mine accent; the tooltip names
 * who reacted. "Add reaction" opens the three drawn reactions. Past days only show them.
 */
export function ReactionBar({ entry }: { entry: StandupEntry }) {
  const { t } = useTranslation();
  const { day, me, live } = useDayView();
  const toggle = useToggleReaction(day.group.id, me);
  const shown = entry.reactions.filter((r) => r.count > 0);
  const set = (emoji: StandupReaction, on: boolean) => {
    toggle.mutate({ entryId: entry.id, emoji, on });
  };
  if (!live && shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((r) => {
        const Icon = ICONS[r.emoji];
        const name = t(`standup.reactions.${r.emoji}`);
        const who = r.users.map((u) => (u.id === me.id ? t('standup.day.you') : shortName(u.name)));
        return (
          <Tooltip
            key={r.emoji}
            content={t('standup.day.reactedBy', { reaction: name, names: who.join(', ') })}
          >
            {(props) => (
              <button
                {...props}
                type="button"
                aria-pressed={r.mine}
                aria-label={t('standup.day.reactionCount', { reaction: name, count: r.count })}
                aria-disabled={live ? undefined : 'true'}
                onClick={() => {
                  if (live) set(r.emoji, !r.mine);
                }}
                className={cn(
                  'inline-flex h-[26px] items-center gap-1 rounded-[13px] border px-2 text-[12px] font-semibold',
                  r.mine
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-default bg-surface text-3',
                  live ? 'hover:brightness-95' : 'cursor-default',
                )}
              >
                <Icon size={13} />
                {r.count}
              </button>
            )}
          </Tooltip>
        );
      })}
      {live && (
        <Popover
          label={t('standup.day.addReaction')}
          placement="bottom-start"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={t('standup.day.addReaction')}
              className="flex size-[26px] items-center justify-center rounded-[13px] border border-dashed border-strong bg-transparent text-icon hover:bg-hover"
            >
              <SmileIcon size={13} />
            </button>
          )}
        >
          {(close) => (
            <div className="flex gap-1 p-1">
              {STANDUP_REACTIONS.map((emoji) => {
                const Icon = ICONS[emoji];
                const mine = entry.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-pressed={mine}
                    aria-label={t(`standup.reactions.${emoji}`)}
                    title={t(`standup.reactions.${emoji}`)}
                    onClick={() => {
                      set(emoji, !mine);
                      close();
                    }}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-[6px]',
                      mine ? 'bg-accent-soft text-accent-ink' : 'text-3 hover:bg-hover',
                    )}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
