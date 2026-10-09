import type { ActivityFeedItem } from '@kite/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { ME } from '../../test/fixtures';
import { FEED, OLDER_FEED } from '../../test/home';
import { at } from '../../test/tasks';
import { feedLine } from './feedLine';

const OTHER_ID = '01890000-0000-7000-8000-000000000102';

const line = (item: ActivityFeedItem, overrides: Partial<ActivityFeedItem> = {}) =>
  feedLine({ ...item, ...overrides }, { t: i18n.t, formatDate: (d) => `<${d}>`, meId: ME.user.id });

describe('feedLine', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('a comment is a mention when my notification was one', () => {
    const comment = at(FEED, 0);
    expect(line(comment)).toEqual({
      key: 'mentioned',
      values: { actor: 'Dorj E.', task: comment.task.title },
    });
    expect(line(comment, { notificationType: 'comment' }).key).toBe('commented');
  });

  it('a status change names the new status; into Done reads "completed"', () => {
    expect(line(at(FEED, 1))).toMatchObject({
      key: 'statusChanged',
      values: { status: 'In Review' },
    });
    expect(line(at(OLDER_FEED, 0)).key).toBe('completed');
  });

  it('assigning me reads "assigned you"; someone else falls back to "updated"', () => {
    const item = at(FEED, 2);
    expect(line(item).key).toBe('assigned');
    expect(
      line(item, {
        activity: { ...item.activity, payload: { user: { id: OTHER_ID, name: 'Sara K.' } } },
      } as Partial<ActivityFeedItem>).key,
    ).toBe('updated');
  });

  it('a due change carries the formatted date', () => {
    expect(line(at(FEED, 3))).toMatchObject({
      key: 'dueChanged',
      values: { date: '<2026-10-15>' },
    });
  });

  it('other changes read "updated"', () => {
    expect(line(at(FEED, 4)).key).toBe('updated');
  });
});
