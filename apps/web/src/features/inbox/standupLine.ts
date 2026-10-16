import { shortName, type Notification } from '@kite/shared';

/** i18n key under `inbox.standup` of a standup notification's sentence. */
export type StandupLineKey =
  'help' | 'reply' | 'replyBlocker' | 'resolved' | 'mention' | 'reminder' | 'digest';

export interface StandupLine {
  key: StandupLineKey;
  values: Record<string, string | number>;
}

/**
 * The sentence for an inbox row about a standup group ("Bat O. replied to your standup update in
 * Mobile team"). Null for task notifications.
 */
export function standupLine(n: Notification): StandupLine | null {
  if (!n.standup) return null;
  const values = { actor: n.actor ? shortName(n.actor.name) : '', group: n.standup.groupName };
  switch (n.type) {
    case 'standup_help':
      return { key: 'help', values };
    case 'standup_reply':
      return { key: n.standup.blockerId ? 'replyBlocker' : 'reply', values };
    case 'standup_resolved':
      return { key: 'resolved', values };
    case 'standup_reminder':
      return { key: 'reminder', values };
    case 'standup_digest': {
      const d = n.digest;
      const posted = d?.posted.length ?? 0;
      return {
        key: 'digest',
        values: { ...values, posted, expected: posted + (d?.notPosted.length ?? 0) },
      };
    }
    default:
      return { key: 'mention', values };
  }
}

/** Where a standup notification leads: the group's page on that day. */
export const standupHref = (standup: NonNullable<Notification['standup']>) =>
  `/standup/${standup.groupId}?date=${standup.date}`;
