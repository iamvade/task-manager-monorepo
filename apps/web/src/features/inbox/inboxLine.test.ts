import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { ME } from '../../test/fixtures';
import { ARCHIVED, ASSIGNED, MENTION, STATUS } from '../../test/inbox';
import { inboxLine } from './inboxLine';

const line = (n: typeof MENTION) =>
  inboxLine(n, { t: i18n.t, formatDate: (d) => `<${d}>`, meId: ME.user.id });

describe('inboxLine', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('names the task by its key and the actor in short form', () => {
    expect(line(MENTION)).toEqual({
      key: 'mentioned',
      values: { actor: 'Dorj E.', task: MENTION.task.key },
    });
  });

  it('reads the activity behind status and comment notifications', () => {
    expect(line(STATUS)).toMatchObject({ key: 'statusChanged', values: { status: 'In Review' } });
    expect(line(ASSIGNED).key).toBe('assigned');
    // A comment notification on a due-date activity still reads through the activity.
    expect(line(ARCHIVED).key).toBe('dueChanged');
  });

  it('falls back to the notification type when the activity is gone', () => {
    expect(line({ ...MENTION, type: 'comment', activity: null }).key).toBe('commented');
    expect(line({ ...STATUS, activity: null }).key).toBe('updated');
  });
});
