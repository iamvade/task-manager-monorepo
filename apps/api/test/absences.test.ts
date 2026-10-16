import { absenceSchema, workloadReportSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('out of office (user_absences)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const admin = await w.person('admin', 'Bat Od');
    const sara = await w.person('member', 'Sara Khan');
    const dorj = await w.person('member', 'Dorj Enkh');
    const outsider = await w.person(null, 'Out Sider');
    const of = (userId: string) => `/workspaces/${w.ws.id}/members/${userId}/absences`;
    const one = (id: string) => `/workspaces/${w.ws.id}/absences/${id}`;
    return { ...w, admin, sara, dorj, outsider, of, one };
  }

  const future = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it('lets members manage their own time off', async () => {
    const w = await world();
    const res = await w.dorj.api('POST', w.of(w.dorj.user.id), {
      startDate: future(1),
      endDate: future(3),
      note: ' Vacation ',
    });
    expect(res.statusCode, res.body).toBe(201);
    const a = absenceSchema.parse(res.json());
    expect(a).toMatchObject({ userId: w.dorj.user.id, note: 'Vacation' });

    let list = z.array(absenceSchema).parse((await w.sara.api('GET', w.of(w.dorj.user.id))).json());
    expect(list.map((x) => x.id)).toEqual([a.id]);

    const edited = await w.dorj.api('PATCH', w.one(a.id), { endDate: future(5), note: '' });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(absenceSchema.parse(edited.json())).toMatchObject({ endDate: future(5), note: null });

    expect((await w.dorj.api('DELETE', w.one(a.id))).statusCode).toBe(204);
    list = z.array(absenceSchema).parse((await w.dorj.api('GET', w.of(w.dorj.user.id))).json());
    expect(list).toEqual([]);
  });

  it('lets admins manage anyone’s, and no other member', async () => {
    const w = await world();
    const byAdmin = await w.admin.api('POST', w.of(w.dorj.user.id), {
      startDate: future(1),
      endDate: future(1),
    });
    expect(byAdmin.statusCode, byAdmin.body).toBe(201);
    const id = absenceSchema.parse(byAdmin.json()).id;
    expect(
      (await w.sara.api('POST', w.of(w.dorj.user.id), { startDate: future(9), endDate: future(9) }))
        .statusCode,
    ).toBe(403);
    expect((await w.sara.api('PATCH', w.one(id), { note: 'x' })).statusCode).toBe(403);
    expect((await w.sara.api('DELETE', w.one(id))).statusCode).toBe(403);
    expect((await w.outsider.api('DELETE', w.one(id))).statusCode).toBe(404);
    expect((await w.outsider.api('GET', w.of(w.dorj.user.id))).statusCode).toBe(404);
    expect((await w.api('PATCH', w.one(id), { note: 'Sick' })).statusCode).toBe(200);
    expect(
      (await w.api('POST', w.of(w.outsider.user.id), { startDate: future(1), endDate: future(1) }))
        .statusCode,
    ).toBe(404);
  });

  it('rejects overlaps and reversed dates', async () => {
    const w = await world();
    const first = absenceSchema.parse(
      (
        await w.sara.api('POST', w.of(w.sara.user.id), { startDate: future(2), endDate: future(4) })
      ).json(),
    );
    const clash = await w.sara.api('POST', w.of(w.sara.user.id), {
      startDate: future(4),
      endDate: future(6),
    });
    expect(clash.statusCode).toBe(409);
    expect(errorCode(clash)).toBe('ABSENCE_OVERLAP');
    // Back-to-back is fine.
    const second = absenceSchema.parse(
      (
        await w.sara.api('POST', w.of(w.sara.user.id), { startDate: future(5), endDate: future(6) })
      ).json(),
    );
    expect(errorCode(await w.sara.api('PATCH', w.one(second.id), { startDate: future(3) }))).toBe(
      'ABSENCE_OVERLAP',
    );
    expect((await w.sara.api('PATCH', w.one(first.id), { endDate: future(1) })).statusCode).toBe(
      400,
    );
    expect(
      (await w.sara.api('POST', w.of(w.sara.user.id), { startDate: future(9), endDate: future(8) }))
        .statusCode,
    ).toBe(400);
  });

  it('shows past absences only on request, and current ones in Workload', async () => {
    const w = await world();
    await w.sara.api('POST', w.of(w.sara.user.id), { startDate: future(-10), endDate: future(-8) });
    await w.sara.api('POST', w.of(w.sara.user.id), { startDate: future(-1), endDate: future(2) });
    expect((await w.sara.api('GET', w.of(w.sara.user.id))).json<unknown[]>()).toHaveLength(1);
    expect(
      (await w.sara.api('GET', `${w.of(w.sara.user.id)}?include=past`)).json<unknown[]>(),
    ).toHaveLength(2);

    const workload = workloadReportSchema.parse(
      (await w.api('GET', `/workspaces/${w.ws.id}/reports/workload`)).json(),
    );
    expect(workload.people.find((p) => p.user.id === w.sara.user.id)?.absences).toHaveLength(1);
  });

  it('no longer takes away fields on the member PATCH', async () => {
    const w = await world();
    const res = await w.api('PATCH', `/workspaces/${w.ws.id}/members/${w.dorj.user.id}`, {
      awayUntil: '2026-10-20',
    });
    expect(res.statusCode).toBe(400);
  });
});
