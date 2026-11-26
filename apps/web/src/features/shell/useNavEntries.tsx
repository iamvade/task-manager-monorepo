import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useStandupGroups } from '../../api/standups';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import {
  CalendarIcon,
  FeedbackIcon,
  InboxIcon,
  MyTasksIcon,
  PersonalIcon,
  ReportsIcon,
  StandupIcon,
} from '../../components/icons';
import { CountBadge } from '../../components/ui/CountBadge';
import { waitingForMe } from '../standup/useStandup';
import { useUiStore } from '../../stores/ui';
import { FIXED_NAV, type NavKey } from './navItems';

export interface NavEntry {
  key: NavKey;
  to: string;
  /** 16px icon. */
  icon: ReactNode;
  label: string;
  /** Expanded sidebar: the count or badge after the label. */
  trailing?: ReactNode;
  /** Text of the rail's accent dot ("3 unread"); also marks the entry as needing attention. */
  badge?: string;
  /** The current page is this entry's section. */
  active: boolean;
}

/** Every sidebar link, with counts and badges, keyed by `NavKey`. */
export function useNavEntries(): Record<NavKey, NavEntry> {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const ws = useWsPath();
  const { pathname } = useLocation();
  const sidebar = useSidebar(workspace?.id).data;
  const standupGroups = useStandupGroups(workspace?.id).data;

  const entry = (
    key: NavKey,
    path: string,
    icon: ReactNode,
    label: string,
    extra: Pick<NavEntry, 'trailing' | 'badge'> = {},
  ): NavEntry => {
    const to = ws(path);
    return {
      key,
      to,
      icon,
      label,
      ...extra,
      active: pathname === to || pathname.startsWith(`${to}/`),
    };
  };

  const inboxUnread = sidebar?.inboxUnreadCount ?? 0;
  const feedbackUnread = sidebar?.feedbackUnreadCount ?? 0;
  const standupWaiting = waitingForMe(standupGroups).length > 0;

  return {
    inbox: entry('inbox', '/inbox', <InboxIcon size={16} />, t('shell.inbox'), {
      trailing:
        inboxUnread > 0 ? (
          <CountBadge
            tone="accent"
            value={inboxUnread}
            label={t('shell.unread', { count: inboxUnread })}
          />
        ) : null,
      badge: inboxUnread > 0 ? t('shell.unread', { count: inboxUnread }) : undefined,
    }),
    myTasks: entry('myTasks', '/my-tasks', <MyTasksIcon size={16} />, t('shell.myTasks'), {
      trailing: sidebar && (
        <span
          aria-label={t('shell.openTasks', { count: sidebar.myTasksCount })}
          className="text-[12px] text-muted [[aria-current=page]_&]:font-medium [[aria-current=page]_&]:text-accent-ink"
        >
          {sidebar.myTasksCount}
        </span>
      ),
    }),
    personal: entry('personal', '/personal', <PersonalIcon size={16} />, t('shell.personal')),
    // Standup.dc.html: 8px accent dot while I haven't posted today in a group that meets today.
    standup: entry('standup', '/standup', <StandupIcon size={16} />, t('shell.standup'), {
      trailing: standupWaiting ? (
        <span
          role="img"
          aria-label={t('shell.notPostedToday')}
          className="size-2 flex-none rounded-full bg-accent"
        />
      ) : null,
      badge: standupWaiting ? t('shell.notPostedToday') : undefined,
    }),
    outlook: entry('outlook', '/outlook', <CalendarIcon size={16} />, t('shell.outlook')),
    feedback: entry('feedback', '/feedback', <FeedbackIcon size={16} />, t('shell.feedback'), {
      trailing:
        feedbackUnread > 0 ? (
          <CountBadge
            tone="accent"
            value={feedbackUnread}
            label={t('shell.feedbackNew', { count: feedbackUnread })}
          />
        ) : null,
      badge: feedbackUnread > 0 ? t('shell.feedbackNew', { count: feedbackUnread }) : undefined,
    }),
    reports: entry('reports', '/reports', <ReportsIcon size={16} />, t('shell.reports')),
  };
}

export interface NavLayout {
  entries: Record<NavKey, NavEntry>;
  /** The fixed links, then the optional ones the user put in the short list. */
  shortList: NavEntry[];
  /** Optional links kept under "More", in the user's order. */
  hidden: NavEntry[];
}

/** Splits the sidebar links into the short list and "More" from the user's saved prefs. */
export function useNavLayout(): NavLayout {
  const entries = useNavEntries();
  const prefs = useUiStore((s) => s.navItems);
  return {
    entries,
    shortList: [
      ...FIXED_NAV.map((key) => entries[key]),
      ...prefs.filter((p) => p.shown).map((p) => entries[p.key]),
    ],
    hidden: prefs.filter((p) => !p.shown).map((p) => entries[p.key]),
  };
}
