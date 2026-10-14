import { memberHandoverSchema, meResponseSchema, workspaceMemberSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('member offboarding and out-of-office', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const sara = await w.person('member', 'Sara Khan');
    const dorj = await w.person('member', 'Dorj Enkh');
    const solo = await w.createTask({ title: 'Solo', assigneeIds: [dorj.user.id] });
    const pair = await w.createTask({
      title: 'Pair',
      assigneeIds: [dorj.user.id, sara.user.id],
    });
    const review = await w.createTask({ title: 'Review me', statusId: w.status('review').id });
    let res = await w.api('PATCH', `/tasks/${review.id}`, { reviewerId: dorj.user.id });
    expect(res.statusCode, res.body).toBe(200);
    await w.createTask({
      title: 'Done',
      assigneeIds: [dorj.user.id],
      statusId: w.status('done').id,
    });
    res = await w.api('PATCH', `/projects/${w.project.id}`, { leadId: dorj.user.id });
    expect(res.statusCode, res.body).toBe(200);
    const base = `/workspaces/${w.ws.id}/members`;
    return { ...w, sara, dorj, solo, pair, review, base };
  }

  it('previews and hands over open work, then cuts off access', async () => {
    const w = await world();
    const handover = await w.api('GET', `${w.base}/${w.dorj.user.id}/handover`);
    expect(memberHandoverSchema.parse(handover.json())).toEqual({
      openTasks: 2,
      reviewing: 1,
      leadOf: [{ id: w.project.id, key: w.project.key, name: w.project.name }],
    });

    const res = await w.api('POST', `${w.base}/${w.dorj.user.id}/deactivate`, {
      reassignTo: w.sara.user.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(workspaceMemberSchema.parse(res.json()).deactivatedAt).not.toBeNull();

    const rows = await w.list();
    const byTitle = (title: string) => rows.find((t) => t.title === title);
    expect(byTitle('Solo')?.assignees.map((u) => u.id)).toEqual([w.sara.user.id]);
    expect(byTitle('Pair')?.assignees.map((u) => u.id)).toEqual([w.sara.user.id]);
    expect(byTitle('Done')?.assignees.map((u) => u.id)).toEqual([w.dorj.user.id]);
    const review = await w.api('GET', `/tasks/${w.review.id}`);
    expect(review.json()).toMatchObject({ reviewerId: w.sara.user.id });
    const project = await w.api('GET', `/projects/${w.project.id}`);
    expect(project.json()).toMatchObject({ leadId: w.sara.user.id });
    const types = (await w.activities(w.solo.id)).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(['assignee.removed', 'assignee.added']));

    // The leaver: no workspace, 404 everywhere in it.
    const me = meResponseSchema.parse((await w.dorj.api('GET', '/auth/me')).json());
    expect(me.workspaces).toEqual([]);
    for (const path of [
      `/projects/${w.project.id}`,
      `/projects/${w.project.id}/tasks`,
      `/tasks/${w.solo.id}`,
      `/workspaces/${w.ws.id}/sidebar`,
      `/workspaces/${w.ws.id}/members`,
    ]) {
      const r = await w.dorj.api('GET', path);
      expect(r.statusCode, path).toBe(404);
    }
    // Nobody can pick them any more.
    const pick = await w.api('PUT', `/tasks/${w.solo.id}/assignees`, { userIds: [w.dorj.user.id] });
    expect(pick.statusCode).toBe(400);
    const members = z.array(workspaceMemberSchema).parse((await w.api('GET', w.base)).json());
    expect(members.map((m) => m.user.id)).not.toContain(w.dorj.user.id);
    const all = z
      .array(workspaceMemberSchema)
      .parse((await w.api('GET', `${w.base}?include=deactivated`)).json());
    expect(all.find((m) => m.user.id === w.dorj.user.id)?.deactivatedAt).not.toBeNull();
    expect((await w.sara.api('GET', `${w.base}?include=deactivated`)).statusCode).toBe(403);

    // Reactivating gives access back; handed-over work stays.
    const back = await w.api('POST', `${w.base}/${w.dorj.user.id}/reactivate`);
    expect(back.statusCode, back.body).toBe(200);
    expect((await w.dorj.api('GET', `/projects/${w.project.id}`)).statusCode).toBe(200);
    expect((await w.api('POST', `${w.base}/${w.dorj.user.id}/reactivate`)).statusCode).toBe(404);
  });

  it('just removes the leaver without a successor, and refuses owner, self and members', async () => {
    const w = await world();
    expect(
      (await w.sara.api('POST', `${w.base}/${w.dorj.user.id}/deactivate`, {})).statusCode,
    ).toBe(403);
    let res = await w.api('POST', `${w.base}/${w.owner.id}/deactivate`, {});
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('DEACTIVATE_OWNER');
    const admin = await w.person('admin', 'Bat Admin');
    res = await admin.api('POST', `${w.base}/${admin.user.id}/deactivate`, {});
    expect(errorCode(res)).toBe('DEACTIVATE_SELF');
    res = await w.api('POST', `${w.base}/${w.dorj.user.id}/deactivate`, {
      reassignTo: w.dorj.user.id,
    });
    expect(res.statusCode).toBe(400);
    res = await w.api('POST', `${w.base}/${w.dorj.user.id}/deactivate`, {});
    expect(res.statusCode, res.body).toBe(200);
    const rows = await w.list();
    expect(rows.find((t) => t.title === 'Solo')?.assignees).toEqual([]);
    expect(rows.find((t) => t.title === 'Pair')?.assignees.map((u) => u.id)).toEqual([
      w.sara.user.id,
    ]);
    const project = await w.api('GET', `/projects/${w.project.id}`);
    expect(project.json()).toMatchObject({ leadId: null });
  });

  it('lets members set only their own out-of-office', async () => {
    const w = await world();
    const self = await w.dorj.api('PATCH', `${w.base}/${w.dorj.user.id}`, {
      awayUntil: '2026-10-20',
      awayNote: 'Vacation',
    });
    expect(self.statusCode, self.body).toBe(200);
    expect(workspaceMemberSchema.parse(self.json())).toMatchObject({
      awayUntil: '2026-10-20',
      awayNote: 'Vacation',
    });
    expect(
      (await w.dorj.api('PATCH', `${w.base}/${w.dorj.user.id}`, { title: 'Boss' })).statusCode,
    ).toBe(403);
    expect(
      (await w.dorj.api('PATCH', `${w.base}/${w.sara.user.id}`, { awayUntil: '2026-10-20' }))
        .statusCode,
    ).toBe(403);
    // Admins may set anyone's; null = back.
    const admin = await w.api('PATCH', `${w.base}/${w.dorj.user.id}`, { awayUntil: null });
    expect(workspaceMemberSchema.parse(admin.json()).awayUntil).toBeNull();
  });
});
