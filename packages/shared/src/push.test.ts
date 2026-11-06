import { describe, expect, it } from 'vitest';
import { pushText, type PushSource } from './push.js';
import { pushSubscriptionSchema } from './schemas/push.js';

const base: PushSource = {
  type: 'comment',
  actorName: 'Sara Khan',
  task: { key: 'APP-142', title: 'Onboarding flow' },
  activityType: 'comment.added',
  statusTo: null,
  standup: null,
  digest: null,
  snippet: null,
};

describe('pushText', () => {
  it('titles a task push "person · key" and says what happened with the task title', () => {
    expect(pushText(base, 'en')).toEqual({
      title: 'Sara K. · APP-142',
      body: 'Commented · Onboarding flow',
    });
  });

  it('quotes the comment instead of the title when there is one (design: lock screen)', () => {
    expect(pushText({ ...base, type: 'mention', snippet: 'Ready for sign-off' }, 'en').body).toBe(
      'Mentioned you: “Ready for sign-off”',
    );
    expect(pushText({ ...base, type: 'mention', snippet: 'Батлахад бэлэн' }, 'mn').body).toBe(
      'Таныг дурдлаа: «Батлахад бэлэн»',
    );
  });

  it('lets mention and assigned win over the activity, like the Inbox', () => {
    expect(pushText({ ...base, type: 'assigned', activityType: 'assignee.added' }, 'mn').body).toBe(
      'Таныг хариуцагчаар томиллоо · Onboarding flow',
    );
  });

  it('reads a move into done as completed and names other statuses (default ones translated)', () => {
    const status = { ...base, type: 'status' as const, activityType: 'status.changed' };
    expect(pushText({ ...status, statusTo: { name: null, category: 'done' } }, 'en').body).toBe(
      'Completed · Onboarding flow',
    );
    expect(pushText({ ...status, statusTo: { name: null, category: 'review' } }, 'mn').body).toBe(
      'Төлөвийг «Хянагдаж буй» болголоо · Onboarding flow',
    );
    expect(pushText({ ...status, statusTo: { name: 'QA', category: 'review' } }, 'en').body).toBe(
      'Moved to QA · Onboarding flow',
    );
  });

  it('titles a standup push with the group and uses the Inbox sentence', () => {
    const standup: PushSource = {
      ...base,
      type: 'standup_reply',
      task: null,
      activityType: null,
      standup: { groupName: 'Mobile team', onBlocker: true },
      snippet: 'On it',
    };
    expect(pushText(standup, 'en')).toEqual({
      title: 'Standup · Mobile team',
      body: 'Sara K. replied to your blocker in Mobile team\n“On it”',
    });
    expect(
      pushText(
        {
          ...standup,
          type: 'standup_digest',
          actorName: null,
          snippet: null,
          digest: { posted: 4, expected: 6 },
        },
        'mn',
      ),
    ).toEqual({ title: 'Стэндап · Mobile team', body: 'Mobile team стэндап: 6-аас 4 нь бичсэн' });
  });

  it('shortens a long task title', () => {
    const { body } = pushText({ ...base, task: { key: 'APP-1', title: 'x'.repeat(300) } }, 'en');
    expect(body).toHaveLength('Commented · '.length + 120);
    expect(body.endsWith('…')).toBe(true);
  });
});

describe('pushSubscriptionSchema', () => {
  // Real-shaped keys: 65-byte p256dh and 16-byte auth, base64url.
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  };

  it('accepts what PushSubscription.toJSON() gives', () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects plain http and keys of the wrong size', () => {
    expect(
      pushSubscriptionSchema.safeParse({ ...valid, endpoint: 'http://fcm.googleapis.com/x' })
        .success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...valid, keys: { ...valid.keys, auth: 'short' } })
        .success,
    ).toBe(false);
  });
});
