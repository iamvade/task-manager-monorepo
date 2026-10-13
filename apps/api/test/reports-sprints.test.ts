import { sprintsReportSchema, type StatusCategory } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { insertHoliday, insertSprint, timelineTask } from './report-fixtures.js';
import { createSpace } from './fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026, 12:00 in Ulaanbaatar. Sprint 4 (Oct 12–23, Oct 15 a holiday) is
// current: day 3 of 9 working days.
const NOW = new Date('2026-10-14T04:00:00Z');
// Planning, the Saturday before each sprint, 16:00 in Ulaanbaatar: after the previous sprint's
// end, before the next start.
const PLAN = [
  '2026-08-29T08:00:00Z',
  '2026-09-12T08:00:00Z',
  '2026-09-26T08:00:00Z',
  '2026-10-10T08:00:00Z',
];

describe('GET /workspaces/:id/reports/sprints', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const p = w.project.id;
    const s1 = await insertSprint(ctx.db, p, 1, '2026-08-31', '2026-09-11');
    const s2 = await insertSprint(ctx.db, p, 2, '2026-09-14', '2026-09-25');
    const s3 = await insertSprint(ctx.db, p, 3, '2026-09-28', '2026-10-09');
    const s4 = await insertSprint(ctx.db, p, 4, '2026-10-12', '2026-10-23');
    await insertHoliday(ctx.db, w.ws.id, '2026-10-15');
    const base = { projectId: p, createdBy: w.owner.id };
    const [p1, p2, p3, p4] = PLAN as [string, string, string, string];

    // Carried through every sprint, never finished: carried 3 times → Replan.
    const t1 = await timelineTask(ctx.db, {
      ...base,
      title: 'T1',
      timeline: [['todo', '2026-08-28T00:00:00Z']],
      sprints: [
        { sprintId: s1.id, added: p1, removed: p2 },
        { sprintId: s2.id, added: p2, removed: p3 },
        { sprintId: s3.id, added: p3, removed: p4 },
        { sprintId: s4.id, added: p4 },
      ],
    });
    // Carried once, from sprint 3.
    const t2 = await timelineTask(ctx.db, {
      ...base,
      title: 'T2',
      timeline: [['todo', '2026-09-20T00:00:00Z']],
      sprints: [
        { sprintId: s3.id, added: p3, removed: p4 },
        { sprintId: s4.id, added: p4 },
      ],
    });
    // Committed to sprint 4, done Oct 13 (10:00 in Ulaanbaatar).
    await timelineTask(ctx.db, {
      ...base,
      title: 'T3',
      timeline: [
        ['todo', '2026-10-09T00:00:00Z'],
        ['in_progress', '2026-10-12T02:00:00Z'],
        ['done', '2026-10-13T02:00:00Z'],
      ],
      sprints: [{ sprintId: s4.id, added: p4 }],
    });
    // Added mid-sprint on Oct 13.
    await timelineTask(ctx.db, {
      ...base,
      title: 'T4',
      timeline: [['todo', '2026-10-13T02:00:00Z']],
      sprints: [{ sprintId: s4.id, added: '2026-10-13T03:00:00Z' }],
    });
    // Committed to sprint 4, new.
    await timelineTask(ctx.db, {
      ...base,
      title: 'T5',
      timeline: [['todo', '2026-10-09T00:00:00Z']],
      sprints: [{ sprintId: s4.id, added: p4 }],
    });
    // Done inside sprint 3.
    await timelineTask(ctx.db, {
      ...base,
      title: 'T7',
      timeline: [
        ['todo', '2026-09-25T00:00:00Z'],
        ['done', '2026-10-02T02:00:00Z'],
      ],
      sprints: [{ sprintId: s3.id, added: p3 }],
    });
    // Removed from sprint 4 again before it started: not committed.
    await timelineTask(ctx.db, {
      ...base,
      title: 'Removed',
      timeline: [['todo', '2026-10-09T00:00:00Z']],
      sprints: [{ sprintId: s4.id, added: p4, removed: '2026-10-11T00:00:00Z' }],
    });
    return { w, s1, s2, s3, s4, t1, t2 };
  }

  async function sprints(w: Awaited<ReturnType<typeof taskWorld>>, query: string) {
    const res = await w.api('GET', `/workspaces/${w.ws.id}/reports/sprints?${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return sprintsReportSchema.parse(res.json());
  }

  let fx: Awaited<ReturnType<typeof world>>;
  beforeAll(async () => {
    fx = await world();
  });

  it('defaults to the current sprint and lists sprints newest first', async () => {
    const r = await sprints(fx.w, `projectId=${fx.w.project.id}`);
    expect(r.sprints.map((s) => [s.number, s.current])).toEqual([
      [4, true],
      [3, false],
      [2, false],
      [1, false],
    ]);
    expect(r.sprint?.number).toBe(4);
    expect(r.sprint?.state).toBe('current');
    expect(r.sprint?.previousSprint?.number).toBe(3);
    expect(r.sprint?.nextSprint).toBeNull();
  });

  it('counts working days without weekends and workspace holidays', async () => {
    const s = (await sprints(fx.w, `projectId=${fx.w.project.id}`)).sprint;
    // Oct 12–23 has 10 weekdays; Oct 15 is a holiday.
    expect(s?.workingDays).toEqual({ total: 9, elapsed: 3, left: 6 });
    expect(s?.burndown.map((p) => p.date)).toEqual([
      '2026-10-12',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
  });

  it('splits committed, added mid-sprint, completed and carried over', async () => {
    const s = (await sprints(fx.w, `projectId=${fx.w.project.id}`)).sprint;
    expect(s).toMatchObject({
      committed: 4,
      carriedIn: 2,
      carriedInRepeated: 1,
      added: 1,
      completed: 1,
      carriedOut: null,
    });
    expect(s?.carried.map((t) => [t.title, t.timesCarried, t.replan])).toEqual([
      ['T1', 3, true],
      ['T2', 1, false],
    ]);
  });

  it('burns down open tasks per working day, with ideal, scope added and the projection', async () => {
    const s = (await sprints(fx.w, `projectId=${fx.w.project.id}`)).sprint;
    expect(s?.burndown.map((p) => p.remaining)).toEqual([
      4,
      4,
      4,
      4,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(s?.burndown.map((p) => p.added)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(s?.burndown.slice(0, 4).map((p) => p.ideal)).toEqual([4, 3.6, 3.1, 2.7]);
    expect(s?.burndown.at(-1)?.ideal).toBe(0);
    // No net progress yet: the projection stays at 4, and 4 vs 2.7 ideal is behind.
    expect(s?.projectedRemaining).toBe(4);
    expect(s?.pace).toBe('behind');
  });

  it('keeps the last sprints’ totals for the chart', async () => {
    const s = (await sprints(fx.w, `projectId=${fx.w.project.id}`)).sprint;
    expect(s?.recent.map((r) => [r.number, r.committed, r.added, r.completed])).toEqual([
      [1, 1, 0, 0],
      [2, 1, 0, 0],
      [3, 3, 0, 1],
      [4, 4, 1, 1],
    ]);
  });

  it('a past sprint reports what it carried into the next one', async () => {
    const s = (await sprints(fx.w, `projectId=${fx.w.project.id}&sprintId=${fx.s3.id}`)).sprint;
    expect(s).toMatchObject({
      number: 3,
      state: 'past',
      current: false,
      workingDays: { total: 10, elapsed: 10, left: 0 },
      committed: 3,
      completed: 1,
      carriedIn: 1,
      carriedOut: 2,
      projectedRemaining: null,
      pace: null,
    });
    expect(s?.burndown).toHaveLength(11);
    expect(s?.burndown.at(-1)?.remaining).toBe(2);
    expect(s?.carried.map((t) => [t.title, t.timesCarried])).toEqual([['T1', 2]]);
  });

  it('404s a sprint of another project', async () => {
    const other = await fx.w.newProject('Other');
    const res = await fx.w.api(
      'GET',
      `/workspaces/${fx.w.ws.id}/reports/sprints?projectId=${other.id}&sprintId=${fx.s3.id}`,
    );
    expect(res.statusCode).toBe(404);
  });

  it('names the status open tasks wait longest in (current sprint only)', async () => {
    const current = (await sprints(fx.w, `projectId=${fx.w.project.id}`)).sprint;
    // T1 has waited in To Do since August; nothing else is in progress or review.
    expect(current?.waitingMost).toBe('todo');
    const past = (await sprints(fx.w, `projectId=${fx.w.project.id}&sprintId=${fx.s3.id}`)).sprint;
    expect(past?.waitingMost).toBeNull();
  });

  it('without projectId shows the first project in scope that has sprints', async () => {
    const t = await taskWorld(ctx, 'Default Owner');
    // The first project (by position) has no sprints; a later one does.
    const later = await t.newProject('Later');
    await insertSprint(ctx.db, later.id, 1, '2026-10-12', '2026-10-23');
    const r = await sprints(t, '');
    expect(r.project?.id).toBe(later.id);
    expect(r.sprint?.number).toBe(1);
    expect(r.scope.projectId).toBeNull();

    // A space without sprint projects falls back to its first project.
    const space = await createSpace(ctx.db, t.ws.id);
    const plain = await t.newProject('Plain', space.id);
    const inSpace = await sprints(t, `spaceId=${space.id}`);
    expect(inSpace.project?.id).toBe(plain.id);
    expect(inSpace.sprint).toBeNull();

    // An empty space has nothing to show.
    const empty = await createSpace(ctx.db, t.ws.id);
    const none = await sprints(t, `spaceId=${empty.id}`);
    expect(none).toMatchObject({ project: null, sprints: [], sprint: null });

    // sprintId alone is rejected.
    const res = await t.api('GET', `/workspaces/${t.ws.id}/reports/sprints?sprintId=${fx.s3.id}`);
    expect(res.statusCode).toBe(400);
  });

  it('a project without sprints has no sprint', async () => {
    const other = await fx.w.newProject('No sprints');
    const r = await sprints(fx.w, `projectId=${other.id}`);
    expect(r.sprints).toEqual([]);
    expect(r.sprint).toBeNull();
  });

  describe('carried over: when the task left the previous sprint', () => {
    // Replans happen inside sprints too (the last afternoon, or after the next sprint started):
    // a task counts as carried when it was not done at the moment it left the previous sprint.
    let w: Awaited<ReturnType<typeof taskWorld>>;
    let s3: Awaited<ReturnType<typeof insertSprint>>;
    let s4: Awaited<ReturnType<typeof insertSprint>>;

    beforeAll(async () => {
      w = await taskWorld(ctx, 'Carry Owner');
      const p = w.project.id;
      const s2 = await insertSprint(ctx.db, p, 2, '2026-09-14', '2026-09-25');
      s3 = await insertSprint(ctx.db, p, 3, '2026-09-28', '2026-10-09');
      s4 = await insertSprint(ctx.db, p, 4, '2026-10-12', '2026-10-23');
      const base = { projectId: p, createdBy: w.owner.id };
      const [, p2, p3, p4] = PLAN as [string, string, string, string];
      const todo = (iso: string): [StatusCategory, string][] => [['todo', iso]];

      // Moved on sprint 3's last afternoon (Friday Oct 9, 16:00 in Ulaanbaatar).
      await timelineTask(ctx.db, {
        ...base,
        title: 'LastAfternoon',
        timeline: todo('2026-09-29T00:00:00Z'),
        sprints: [
          { sprintId: s3.id, added: p3, removed: '2026-10-09T08:00:00Z' },
          { sprintId: s4.id, added: '2026-10-09T08:00:00Z' },
        ],
      });
      // Moved after sprint 4 had started: carried and added mid-sprint.
      await timelineTask(ctx.db, {
        ...base,
        title: 'AfterStart',
        timeline: todo('2026-09-29T00:00:00Z'),
        sprints: [
          { sprintId: s3.id, added: p3, removed: '2026-10-13T02:00:00Z' },
          { sprintId: s4.id, added: '2026-10-13T02:00:00Z' },
        ],
      });
      // Parked (no sprint) mid-sprint 3, planned into sprint 4.
      await timelineTask(ctx.db, {
        ...base,
        title: 'Parked',
        timeline: todo('2026-09-29T00:00:00Z'),
        sprints: [
          { sprintId: s3.id, added: p3, removed: '2026-10-05T02:00:00Z' },
          { sprintId: s4.id, added: p4 },
        ],
      });
      // Done inside sprint 3 and moved while done (reopened later): not carried.
      await timelineTask(ctx.db, {
        ...base,
        title: 'DoneBeforeLeaving',
        timeline: [
          ['todo', '2026-09-29T00:00:00Z'],
          ['done', '2026-10-02T02:00:00Z'],
          ['in_progress', '2026-10-13T02:00:00Z'],
        ],
        sprints: [
          { sprintId: s3.id, added: p3, removed: p4 },
          { sprintId: s4.id, added: p4 },
        ],
      });
      // Done, then reopened before sprint 3 ended: carried.
      await timelineTask(ctx.db, {
        ...base,
        title: 'Reopened',
        timeline: [
          ['todo', '2026-09-29T00:00:00Z'],
          ['done', '2026-10-02T02:00:00Z'],
          ['todo', '2026-10-07T02:00:00Z'],
        ],
        sprints: [
          { sprintId: s3.id, added: p3, removed: p4 },
          { sprintId: s4.id, added: p4 },
        ],
      });
      // Bounced 3 → 4 → 3 → 4: one row, carried once.
      await timelineTask(ctx.db, {
        ...base,
        title: 'PingPong',
        timeline: todo('2026-09-29T00:00:00Z'),
        sprints: [
          { sprintId: s3.id, added: p3, removed: '2026-10-01T02:00:00Z' },
          { sprintId: s4.id, added: '2026-10-01T02:00:00Z', removed: '2026-10-02T02:00:00Z' },
          { sprintId: s3.id, added: '2026-10-02T02:00:00Z', removed: p4 },
          { sprintId: s4.id, added: p4 },
        ],
      });
      // Pulled out of sprint 3 before it began: never in it.
      await timelineTask(ctx.db, {
        ...base,
        title: 'PulledEarly',
        timeline: todo('2026-09-26T00:00:00Z'),
        sprints: [
          { sprintId: s3.id, added: p3, removed: '2026-09-27T00:00:00Z' },
          { sprintId: s4.id, added: p4 },
        ],
      });
      // Carried 2 → 3 in the gap, then 3 → 4 on the last afternoon: carried twice.
      await timelineTask(ctx.db, {
        ...base,
        title: 'Twice',
        timeline: todo('2026-09-12T00:00:00Z'),
        sprints: [
          { sprintId: s2.id, added: p2, removed: p3 },
          { sprintId: s3.id, added: p3, removed: '2026-10-09T09:00:00Z' },
          { sprintId: s4.id, added: '2026-10-09T09:00:00Z' },
        ],
      });
    });

    it('counts tasks that left the previous sprint unfinished, whenever they left', async () => {
      const s = (await sprints(w, `projectId=${w.project.id}`)).sprint;
      expect(s).toMatchObject({ number: 4, committed: 7, added: 1, carriedIn: 6 });
      expect(s?.carried.map((t) => [t.title, t.timesCarried]).sort()).toEqual([
        ['AfterStart', 1],
        ['LastAfternoon', 1],
        ['Parked', 1],
        ['PingPong', 1],
        ['Reopened', 1],
        ['Twice', 2],
      ]);
      expect(s?.carriedInRepeated).toBe(1);
    });

    it('a past sprint counts the same tasks as carried to the next one', async () => {
      const s = (await sprints(w, `projectId=${w.project.id}&sprintId=${s3.id}`)).sprint;
      expect(s).toMatchObject({ number: 3, state: 'past', carriedOut: 6, carriedIn: 1 });
      expect(s?.carried.map((t) => t.title)).toEqual(['Twice']);
    });
  });

  it('exports the sprint’s tasks as CSV', async () => {
    const res = await fx.w.api(
      'GET',
      `/workspaces/${fx.w.ws.id}/reports/sprints.csv?projectId=${fx.w.project.id}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    // Header + T1, T2, T3, T4, T5 (the removed task never counted).
    expect(lines).toHaveLength(6);
    expect(lines.find((l) => l.includes(',T1,'))).toMatch(/,3,Тийм$/);
  });
});
