import { outlookBusySchema, outlookConnectionSchema, outlookEventsSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outlookCalendars, users, workspaceMembers } from '../src/db/schema/index.js';
import type { IcsFetch } from '../src/outlook/fetch.js';
import { OUTLOOK_CACHE_TTL_MS } from '../src/outlook/service.js';
import { addMember, apiClient, createUser, createWorkspace, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { OUTLOOK_FEED } from './outlook-feed.js';

const SECRET = 'a1b2c3d4e5f6secretpart';
const LINK = `https://outlook.office365.com/owa/calendar/${SECRET}@kite.test/${SECRET}/calendar.ics`;

/** What the fake Outlook answers, per URL; every request is recorded. */
let routes: Record<string, () => Response>;
let requests: { url: string; redirect: RequestInit['redirect'] }[];
const fakeFetch: IcsFetch = (url, init) => {
  requests.push({ url, redirect: init.redirect });
  const route = routes[url];
  return Promise.resolve(route ? route() : new Response('nope', { status: 404 }));
};
const ics =
  (body = OUTLOOK_FEED) =>
  () =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/calendar' } });

let now = new Date('2026-11-18T03:00:00Z');
let logs = '';

describe('Outlook calendar', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp(
      {},
      {
        icsFetch: fakeFetch,
        now: () => now,
        logStream: new Writable({
          write(chunk: Buffer, _enc, cb) {
            logs += chunk.toString();
            cb();
          },
        }),
      },
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(() => {
    routes = { [LINK]: ics() };
    requests = [];
    now = new Date('2026-11-18T03:00:00Z');
  });

  async function world() {
    const owner = await createUser(ctx.db, { name: 'Anu' });
    const mate = await createUser(ctx.db, { name: 'Bat' });
    const outsider = await createUser(ctx.db, { name: 'Outsider' });
    const ws = await createWorkspace(ctx.db, owner.id);
    await addMember(ctx.db, ws.id, mate.id);
    await createWorkspace(ctx.db, outsider.id);
    return {
      owner,
      mate,
      ws,
      api: apiClient(ctx.app, await login(ctx.app, owner.email)),
      mateApi: apiClient(ctx.app, await login(ctx.app, mate.email)),
      outsiderApi: apiClient(ctx.app, await login(ctx.app, outsider.email)),
    };
  }

  const connect = (api: ReturnType<typeof apiClient>, url = LINK) =>
    api('PUT', '/me/outlook-calendar', { url });

  it('connects a published calendar, never echoing the link', async () => {
    const w = await world();
    const before = outlookConnectionSchema.parse(
      (await w.api('GET', '/me/outlook-calendar')).json(),
    );
    expect(before.connected).toBe(false);

    const res = await connect(w.api, LINK.replace('https://', 'webcal://'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).not.toContain(SECRET);
    expect(outlookConnectionSchema.parse(res.json())).toMatchObject({
      connected: true,
      host: 'outlook.office365.com',
      lastError: null,
    });
    // webcal:// is fetched as https, redirects by hand.
    expect(requests).toEqual([{ url: LINK, redirect: 'manual' }]);
    expect((await w.api('GET', '/me/outlook-calendar')).body).not.toContain(SECRET);
    expect(logs).not.toContain(SECRET);
  });

  it('refuses links that are not on an Outlook host', async () => {
    const w = await world();
    for (const url of [
      'http://outlook.office365.com/owa/calendar/x/calendar.ics',
      'https://outlook.office365.com:8443/owa/calendar/x/calendar.ics',
      'https://evil.example/calendar.ics',
      'https://outlook.office365.com.evil.example/calendar.ics',
      'https://user:pw@outlook.live.com/calendar.ics',
      'http://127.0.0.1/calendar.ics',
      'not a url',
    ]) {
      const res = await connect(w.api, url);
      expect(res.statusCode, url).toBe(400);
      expect(errorCode(res)).toBe('INVALID_OUTLOOK_LINK');
    }
    expect(requests).toEqual([]);
  });

  it('says why a link could not be read, and saves nothing', async () => {
    const w = await world();
    const live = 'https://outlook.live.com/owa/calendar/x/calendar.ics';
    routes[live] = () => new Response('<html>Sign in</html>', { status: 200 });
    let res = await connect(w.api, live);
    expect(errorCode(res)).toBe('OUTLOOK_NOT_CALENDAR');

    res = await connect(w.api, 'https://outlook.live.com/owa/calendar/missing/calendar.ics');
    expect(errorCode(res)).toBe('OUTLOOK_NOT_FOUND');

    const big = 'https://outlook.live.com/owa/calendar/big/calendar.ics';
    routes[big] = () =>
      new Response('x', { status: 200, headers: { 'content-length': String(6 * 1024 * 1024) } });
    res = await connect(w.api, big);
    expect(errorCode(res)).toBe('OUTLOOK_TOO_LARGE');

    // A redirect off Outlook is never followed.
    const hop = 'https://outlook.live.com/owa/calendar/hop/calendar.ics';
    routes[hop] = () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } });
    res = await connect(w.api, hop);
    expect(errorCode(res)).toBe('OUTLOOK_UNREACHABLE');
    expect(requests.map((r) => r.url)).not.toContain('http://169.254.169.254/latest');

    const rows = await ctx.db
      .select()
      .from(outlookCalendars)
      .where(eq(outlookCalendars.userId, w.owner.id));
    expect(rows).toEqual([]);
  });

  it('follows a redirect that stays on Outlook', async () => {
    const w = await world();
    const first = 'https://outlook.office365.com/owa/calendar/old/calendar.ics';
    routes[first] = () => new Response(null, { status: 301, headers: { location: LINK } });
    expect((await connect(w.api, first)).statusCode).toBe(200);
    expect(requests.map((r) => r.url)).toEqual([first, LINK]);
  });

  it('returns my events for a range, caches the feed, refreshes on demand', async () => {
    const w = await world();
    await connect(w.api, LINK);
    requests = [];
    const res = await w.api('GET', '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22');
    expect(res.statusCode, res.body).toBe(200);
    const body = outlookEventsSchema.parse(res.json());
    expect(body.connected).toBe(true);
    expect(body.events.map((e) => e.title)).toEqual(
      expect.arrayContaining(['Conference', 'Release night', 'Focus reminder']),
    );
    expect(body.events.some((e) => e.title.includes('Lunch'))).toBe(false);
    // Connecting fetched it: served from memory.
    expect(requests).toEqual([]);

    now = new Date(now.getTime() + OUTLOOK_CACHE_TTL_MS + 1000);
    await w.api('GET', '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22');
    expect(requests).toHaveLength(1);
    await w.api('GET', '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22&refresh=true');
    expect(requests).toHaveLength(2);
  });

  it('keeps the last good copy when Outlook stops answering', async () => {
    const w = await world();
    await connect(w.api, LINK);
    routes[LINK] = () => new Response('busy', { status: 503 });
    const body = outlookEventsSchema.parse(
      (
        await w.api('GET', '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22&refresh=true')
      ).json(),
    );
    expect(body.lastError).toBe('unreachable');
    expect(body.events.length).toBeGreaterThan(0);
    const connection = outlookConnectionSchema.parse(
      (await w.api('GET', '/me/outlook-calendar')).json(),
    );
    expect(connection.lastError).toBe('unreachable');
  });

  it('does not refetch a dead link on every view', async () => {
    const w = await world();
    await connect(w.api, LINK);
    // A restart forgets the copy; then Outlook stops answering.
    ctx.app.outlook.forget(w.owner.id);
    routes[LINK] = () => new Response('gone', { status: 404 });
    requests = [];
    const path = '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22';
    const first = outlookEventsSchema.parse((await w.api('GET', path)).json());
    expect(first).toMatchObject({ connected: true, events: [], lastError: 'not_found' });
    await w.api('GET', path);
    expect(requests).toHaveLength(1);
  });

  it('limits the range', async () => {
    const w = await world();
    const res = await w.api('GET', '/me/outlook-calendar/events?from=2026-01-01&to=2026-12-31');
    expect(errorCode(res)).toBe('INVALID_RANGE');
    const backwards = await w.api(
      'GET',
      '/me/outlook-calendar/events?from=2026-11-10&to=2026-11-01',
    );
    expect(backwards.statusCode).toBe(400);
  });

  it('shows teammates busy time only: no titles, places or free time', async () => {
    const w = await world();
    await connect(w.api, LINK);
    const path = `/workspaces/${w.ws.id}/members/${w.owner.id}/outlook-busy?from=2026-11-16&to=2026-11-22`;
    const res = await w.mateApi('GET', path);
    expect(res.statusCode, res.body).toBe(200);
    const body = outlookBusySchema.parse(res.json());
    expect(body.connected).toBe(true);
    expect(body.blocks.length).toBeGreaterThan(0);
    for (const word of ['Conference', 'Release night', 'Focus reminder', 'Room 3', 'weekly-1']) {
      expect(res.body).not.toContain(word);
    }
    expect(body.blocks.some((b) => b.showAs === 'free')).toBe(false);
    expect(Object.keys(body.blocks[0] ?? {}).sort()).toEqual(['allDay', 'end', 'showAs', 'start']);

    // Outside the workspace: 404, like any workspace resource.
    expect((await w.outsiderApi('GET', path)).statusCode).toBe(404);
  });

  it('hides a deactivated member and says when nothing is connected', async () => {
    const w = await world();
    const path = (id: string) =>
      `/workspaces/${w.ws.id}/members/${id}/outlook-busy?from=2026-11-16&to=2026-11-22`;
    const none = outlookBusySchema.parse((await w.api('GET', path(w.mate.id))).json());
    expect(none).toEqual({ connected: false, blocks: [] });

    await connect(w.mateApi, LINK);
    await ctx.db
      .update(workspaceMembers)
      .set({ deactivatedAt: new Date() })
      .where(eq(workspaceMembers.userId, w.mate.id));
    expect((await w.api('GET', path(w.mate.id))).statusCode).toBe(404);
  });

  it('disconnects', async () => {
    const w = await world();
    await connect(w.api, LINK);
    expect((await w.api('DELETE', '/me/outlook-calendar')).statusCode).toBe(204);
    const body = outlookEventsSchema.parse(
      (await w.api('GET', '/me/outlook-calendar/events?from=2026-11-16&to=2026-11-22')).json(),
    );
    expect(body).toMatchObject({ connected: false, events: [] });
    const busy = outlookBusySchema.parse(
      (
        await w.mateApi(
          'GET',
          `/workspaces/${w.ws.id}/members/${w.owner.id}/outlook-busy?from=2026-11-16&to=2026-11-22`,
        )
      ).json(),
    );
    expect(busy.connected).toBe(false);
  });

  it('is not there for the platform admin', async () => {
    const vade = await createUser(ctx.db, { name: 'Vade' });
    await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, vade.id));
    const api = apiClient(ctx.app, await login(ctx.app, vade.email));
    expect((await api('GET', '/me/outlook-calendar')).statusCode).toBe(404);
    expect((await connect(api, LINK)).statusCode).toBe(404);
  });
});
