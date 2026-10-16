import {
  standupDaySchema,
  standupEntrySchema,
  standupGroupSchema,
  standupSuggestionsSchema,
  type SaveStandupEntry,
} from '@kite/shared';
import { expect } from 'vitest';
import type { apiClient } from './fixtures.js';
import type { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
type Api = ReturnType<typeof apiClient>;

/** A pinned, movable clock for `createTestApp({}, { now: clock.now })`. */
export function testClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

/**
 * A workspace with a Mon–Fri standup group (Ulaanbaatar, post by 10:00, reminder 09:30) of the
 * owner Anu (facilitator), Bat (admin), Sara and Dorj; Oyun is in the workspace but not in the
 * group, as is the admin Tuya; Out is in another workspace.
 */
export async function standupWorld(ctx: Ctx) {
  const w = await taskWorld(ctx);
  const bat = await w.person('admin', 'Bat Od');
  const sara = await w.person('member', 'Sara Khan');
  const dorj = await w.person('member', 'Dorj Enkh');
  const oyun = await w.person('member', 'Oyun Tsetseg');
  const tuya = await w.person('admin', 'Tuya Bold');
  const outsider = await w.person(null, 'Out Sider');
  const res = await w.api('POST', `/workspaces/${w.ws.id}/standup-groups`, {
    name: 'Mobile team',
    memberIds: [w.owner.id, bat.user.id, sara.user.id, dorj.user.id],
  });
  expect(res.statusCode, res.body).toBe(201);
  const group = standupGroupSchema.parse(res.json());

  const save = async (api: Api, body: SaveStandupEntry, date = 'today', status = 200) => {
    const r = await api('PUT', `/standup-groups/${group.id}/days/${date}/entry`, body);
    expect(r.statusCode, r.body).toBe(status);
    return r;
  };
  const post = async (api: Api, body: Omit<SaveStandupEntry, 'status'> = {}, date = 'today') =>
    standupEntrySchema.parse((await save(api, { ...body, status: 'posted' }, date)).json());
  const day = async (api: Api = w.api, date = 'today') => {
    const r = await api('GET', `/standup-groups/${group.id}/days/${date}`);
    expect(r.statusCode, r.body).toBe(200);
    return standupDaySchema.parse(r.json());
  };
  const suggestions = async (api: Api = w.api, date?: string) => {
    const r = await api(
      'GET',
      `/standup-groups/${group.id}/suggestions${date ? `?date=${date}` : ''}`,
    );
    expect(r.statusCode, r.body).toBe(200);
    return standupSuggestionsSchema.parse(r.json());
  };
  const anu = { user: w.owner, api: w.api };
  return { ...w, anu, bat, sara, dorj, oyun, tuya, outsider, group, save, post, day, suggestions };
}
