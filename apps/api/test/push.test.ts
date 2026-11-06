import { pushConfigSchema, pushPayloadSchema, type PushPayload } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pushSubscriptions, users } from '../src/db/schema/index.js';
import type { PushOptions, PushResult, PushTransport } from '../src/push/transport.js';
import { isPushServiceEndpoint } from '../src/push/endpoint.js';
import { MAX_PUSH_SUBSCRIPTIONS } from '../src/routes/push.js';
import { apiClient, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';
import { taskWorld } from './task-setup.js';

const VAPID = {
  VAPID_PUBLIC_KEY: 'BPublicKeyForTests',
  VAPID_PRIVATE_KEY: 'private-key-for-tests',
  VAPID_SUBJECT: 'mailto:ops@kite.test',
};

const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

let counter = 0;
const endpoint = (host = 'fcm.googleapis.com') => `https://${host}/fcm/send/test-${++counter}`;

interface Sent {
  endpoint: string;
  payload: PushPayload;
  options: PushOptions;
}

describe('web push', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const sent: Sent[] = [];
  /** What the fake push service answers per endpoint (default: accepted). */
  const answers = new Map<string, PushResult>();
  const transport: PushTransport = (target, payload, options) => {
    sent.push({
      endpoint: target.endpoint,
      payload: pushPayloadSchema.parse(JSON.parse(payload)),
      options,
    });
    return Promise.resolve(answers.get(target.endpoint) ?? { ok: true });
  };

  beforeAll(async () => {
    ctx = await createTestApp(VAPID, { pushTransport: transport });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const sara = await w.person('member', 'Sara Khan');
    const subscribe = async (client: typeof w.api, url = endpoint()) => {
      const res = await client('PUT', '/me/push-subscriptions', { endpoint: url, keys });
      expect(res.statusCode, res.body).toBe(204);
      return url;
    };
    /** Runs a request, then waits for the notifier and the push queue. */
    const settle = async () => {
      await ctx.app.events.idle();
      await ctx.app.push.idle();
    };
    const sentTo = (url: string) => sent.filter((s) => s.endpoint === url);
    const subsOf = (userId: string) =>
      ctx.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    return { ...w, sara, subscribe, settle, sentTo, subsOf };
  }

  describe('endpoint allowlist', () => {
    it('accepts the browsers’ push services only, over https on the default port', () => {
      expect(isPushServiceEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
      expect(isPushServiceEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(
        true,
      );
      expect(isPushServiceEndpoint('https://web.push.apple.com/x')).toBe(true);
      expect(isPushServiceEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);

      expect(isPushServiceEndpoint('http://fcm.googleapis.com/x')).toBe(false);
      expect(isPushServiceEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
      expect(isPushServiceEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
      expect(isPushServiceEndpoint('https://localhost/x')).toBe(false);
      expect(isPushServiceEndpoint('https://169.254.169.254/latest')).toBe(false);
      expect(isPushServiceEndpoint('https://evilpush.apple.com.example.com/x')).toBe(false);
      expect(isPushServiceEndpoint('https://notpush.apple.com/x')).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('serves the VAPID public key to signed-in users only', async () => {
      const w = await world();
      const res = await w.api('GET', '/push/config');
      expect(res.statusCode).toBe(200);
      expect(pushConfigSchema.parse(res.json())).toEqual({
        enabled: true,
        publicKey: VAPID.VAPID_PUBLIC_KEY,
      });
      expect((await apiClient(ctx.app)('GET', '/push/config')).statusCode).toBe(401);
    });

    it('refuses endpoints outside the known push services (no requests into our network)', async () => {
      const w = await world();
      for (const url of ['https://10.0.0.5/push', 'https://kite.internal/push']) {
        const res = await w.api('PUT', '/me/push-subscriptions', { endpoint: url, keys });
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('INVALID_PUSH_ENDPOINT');
      }
      const res = await w.api('PUT', '/me/push-subscriptions', {
        endpoint: endpoint(),
        keys: { ...keys, auth: 'too-short' },
      });
      expect(res.statusCode).toBe(400);
      expect(await w.subsOf(w.owner.id)).toEqual([]);
    });

    it('moves an endpoint to whoever subscribes it last (same browser, new person)', async () => {
      const w = await world();
      const url = await w.subscribe(w.api);
      await w.subscribe(w.sara.api, url);
      expect(await w.subsOf(w.owner.id)).toEqual([]);
      expect((await w.subsOf(w.sara.user.id)).map((s) => s.endpoint)).toEqual([url]);
    });

    it('lets me remove only my own subscription', async () => {
      const w = await world();
      const url = await w.subscribe(w.api);
      const theirs = await w.sara.api('DELETE', '/me/push-subscriptions', { endpoint: url });
      expect(theirs.statusCode).toBe(204);
      expect(await w.subsOf(w.owner.id)).toHaveLength(1);
      const mine = await w.api('DELETE', '/me/push-subscriptions', { endpoint: url });
      expect(mine.statusCode).toBe(204);
      expect(await w.subsOf(w.owner.id)).toEqual([]);
    });

    it('stops pushes to a browser when its session signs out', async () => {
      const w = await world();
      await w.subscribe(w.api);
      expect(await w.subsOf(w.owner.id)).toHaveLength(1);
      const res = await w.api('POST', '/auth/logout');
      expect(res.statusCode, res.body).toBeLessThan(300);
      expect(await w.subsOf(w.owner.id)).toEqual([]);
    });

    it(`keeps a person's ${MAX_PUSH_SUBSCRIPTIONS} most recently used browsers`, async () => {
      const w = await world();
      const first = await w.subscribe(w.api);
      for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS; i++) await w.subscribe(w.api);
      const left = (await w.subsOf(w.owner.id)).map((s) => s.endpoint);
      expect(left).toHaveLength(MAX_PUSH_SUBSCRIPTIONS);
      expect(left).not.toContain(first);
    });
  });

  describe('delivery', () => {
    it('pushes a new notification to the recipient’s browsers in their language', async () => {
      const w = await world();
      await ctx.db.update(users).set({ locale: 'en' }).where(eq(users.id, w.owner.id));
      const ownerUrl = await w.subscribe(w.api);
      const saraUrl = await w.subscribe(w.sara.api);
      const task = await w.createTask({ title: 'Checkout page' });
      await w.settle();
      sent.length = 0;

      const res = await w.sara.api('POST', `/tasks/${task.id}/comments`, {
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ready for review' }] }],
        },
      });
      expect(res.statusCode, res.body).toBe(201);
      await w.settle();

      // The author never hears about their own comment.
      expect(w.sentTo(saraUrl)).toEqual([]);
      const [push, ...rest] = w.sentTo(ownerUrl);
      expect(rest).toEqual([]);
      expect(push?.payload).toMatchObject({
        v: 1,
        workspaceId: w.ws.id,
        title: `Sara K. · ${task.key}`,
        body: 'Commented: “Ready for review”',
        url: `/w/${w.ws.slug}/t/${task.key}`,
      });
      expect(push?.options).toEqual({ ttl: 86_400, urgency: 'normal' });
    });

    it('writes Mongolian by default and wakes the device for an assignment', async () => {
      const w = await world();
      const saraUrl = await w.subscribe(w.sara.api);
      const task = await w.createTask({ title: 'Нэвтрэх', assigneeIds: [w.sara.user.id] });
      await w.settle();
      const [push] = w.sentTo(saraUrl);
      expect(push?.payload).toMatchObject({
        title: `Anu B. · ${task.key}`,
        body: 'Таныг хариуцагчаар томиллоо · Нэвтрэх',
      });
      expect(push?.options.urgency).toBe('high');
    });

    it('sends nothing for a notification type the person turned off', async () => {
      const w = await world();
      await ctx.db
        .update(users)
        .set({
          notificationPrefs: {
            mention: true,
            assigned: false,
            comment: true,
            status: true,
            standups: true,
          },
        })
        .where(eq(users.id, w.sara.user.id));
      const saraUrl = await w.subscribe(w.sara.api);
      await w.createTask({ title: 'Quiet', assigneeIds: [w.sara.user.id] });
      await w.settle();
      expect(w.sentTo(saraUrl)).toEqual([]);
    });

    it('drops a subscription the push service says is gone and keeps one that failed', async () => {
      const w = await world();
      const gone = await w.subscribe(w.sara.api);
      const flaky = await w.subscribe(w.sara.api);
      answers.set(gone, { ok: false, gone: true, status: 410 });
      answers.set(flaky, { ok: false, gone: false, status: 503 });
      await w.createTask({ title: 'Two browsers', assigneeIds: [w.sara.user.id] });
      await w.settle();
      expect(w.sentTo(gone)).toHaveLength(1);
      expect(w.sentTo(flaky)).toHaveLength(1);
      expect((await w.subsOf(w.sara.user.id)).map((s) => s.endpoint)).toEqual([flaky]);
    });
  });

  describe('standups', () => {
    it('titles a standup push with the group and links to the day', async () => {
      // A Thursday in Ulaanbaatar, before post-by: a standup day the group can post on.
      const clock = testClock('2026-10-08T01:00:00Z');
      const sc = await createTestApp(VAPID, { pushTransport: transport, now: clock.now });
      try {
        const w = await standupWorld(sc);
        const batUrl = endpoint();
        const res = await w.bat.api('PUT', '/me/push-subscriptions', { endpoint: batUrl, keys });
        expect(res.statusCode, res.body).toBe(204);
        await w.post(w.dorj.api, {
          blockers: [{ text: 'Need sandbox keys', helperIds: [w.bat.user.id] }],
        });
        await sc.app.events.idle();
        await sc.app.push.idle();

        const [push, ...rest] = sent.filter((s) => s.endpoint === batUrl);
        expect(rest).toEqual([]);
        expect(push?.payload).toMatchObject({
          title: `Стэндап · ${w.group.name}`,
          body: `Dorj E. ${w.group.name}-ийн стэндапад саадаа шийдэхэд таныг туслахыг хүссэн\n«Need sandbox keys»`,
          url: `/w/${w.ws.slug}/standup/${w.group.id}/2026-10-08`,
        });
        expect(push?.options.urgency).toBe('high');
      } finally {
        await sc.close();
      }
    });
  });

  describe('without VAPID keys', () => {
    it('reports push as off and refuses subscriptions', async () => {
      const off = await createTestApp({
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
        VAPID_SUBJECT: undefined,
      });
      try {
        const w = await taskWorld(off);
        const config = await w.api('GET', '/push/config');
        expect(pushConfigSchema.parse(config.json())).toEqual({ enabled: false, publicKey: null });
        const res = await w.api('PUT', '/me/push-subscriptions', { endpoint: endpoint(), keys });
        expect(res.statusCode).toBe(409);
        expect(errorCode(res)).toBe('PUSH_DISABLED');
      } finally {
        await off.close();
      }
    });
  });
});
