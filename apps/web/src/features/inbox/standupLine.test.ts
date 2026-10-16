import { describe, expect, it } from 'vitest';
import { MENTION, standupNotification } from '../../test/inbox';
import { standupHref, standupLine } from './standupLine';

describe('standupLine', () => {
  it('is null for task notifications', () => {
    expect(standupLine(MENTION)).toBeNull();
  });

  it('words each standup notification with the actor and the group', () => {
    const values = { actor: 'Dorj E.', group: 'Mobile team' };
    expect(standupLine(standupNotification('standup_help'))).toEqual({ key: 'help', values });
    expect(standupLine(standupNotification('standup_resolved'))?.key).toBe('resolved');
    expect(standupLine(standupNotification('mention'))?.key).toBe('mention');
    expect(standupLine(standupNotification('standup_reply'))?.key).toBe('reply');
    const onBlocker = standupNotification('standup_reply');
    expect(
      standupLine({
        ...onBlocker,
        standup: onBlocker.standup && {
          ...onBlocker.standup,
          blockerId: '01890000-0000-7000-8000-00000000c003',
        },
      })?.key,
    ).toBe('replyBlocker');
  });

  it('counts the digest and has no actor for reminders', () => {
    const user = (name: string, i: number) => ({
      id: `01890000-0000-7000-8000-00000000d00${i}`,
      name,
      initials: name.slice(0, 2),
      avatarColor: 'sky' as const,
    });
    const digest = standupNotification('standup_digest', {
      actor: null,
      digest: {
        posted: [user('Sara K', 1), user('Bat O', 2)],
        notPosted: [user('Dorj E', 3)],
        out: [user('Mia L', 4)],
        openBlockers: 2,
      },
    });
    expect(standupLine(digest)).toEqual({
      key: 'digest',
      values: { actor: '', group: 'Mobile team', posted: 2, expected: 3 },
    });
    expect(standupLine(standupNotification('standup_reminder', { actor: null }))).toEqual({
      key: 'reminder',
      values: { actor: '', group: 'Mobile team' },
    });
  });

  it('links to the group page on that day', () => {
    const { standup } = standupNotification('standup_help');
    expect(standup && standupHref(standup)).toBe(
      '/standup/01890000-0000-7000-8000-00000000c001?date=2026-10-08',
    );
  });
});
