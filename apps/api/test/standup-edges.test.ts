import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

// Wednesday Oct 7 2026, 09:00 in Ulaanbaatar (UTC+8).
const clock = testClock('2026-10-07T01:00:00Z');

describe('standup edge cases', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists someone who joined mid-week only from that day, and keeps a removed member’s posts', async () => {
    clock.set('2026-10-07T01:00:00Z');
    const w = await standupWorld(ctx);
    await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Wednesday work' }] });

    // Thursday: Oyun joins, Sara leaves the group.
    clock.set('2026-10-08T01:00:00Z');
    const join = await w.api('PUT', `/standup-groups/${w.group.id}/members/${w.oyun.user.id}`);
    expect(join.statusCode, join.body).toBe(200);
    const leave = await w.api('DELETE', `/standup-groups/${w.group.id}/members/${w.sara.user.id}`);
    expect(leave.statusCode, leave.body).toBe(200);

    const wednesday = await w.day(w.anu.api, '2026-10-07');
    const ids = wednesday.members.map((m) => m.user.id);
    expect(ids).not.toContain(w.oyun.user.id);
    // Sara's update of that day is still there (and her column, since she posted).
    expect(wednesday.entries.map((e) => e.user.id)).toEqual([w.sara.user.id]);

    const thursday = await w.day(w.anu.api, 'today');
    expect(thursday.members.map((m) => m.user.id)).toContain(w.oyun.user.id);
    expect(thursday.members.map((m) => m.user.id)).not.toContain(w.sara.user.id);

    // Oyun has nothing from "yesterday": suggestions still work.
    const suggestions = await w.suggestions(w.oyun.api);
    expect(suggestions.previousDate).toBe('2026-10-07');

    // Saving the settings keeps everyone's join time.
    const r = await w.api('PATCH', `/standup-groups/${w.group.id}`, {
      memberIds: [w.oyun.user.id, w.owner.id, w.bat.user.id, w.dorj.user.id],
    });
    expect(r.statusCode, r.body).toBe(200);
    const again = await w.day(w.anu.api, '2026-10-07');
    expect(again.members.map((m) => m.user.id)).not.toContain(w.oyun.user.id);
    expect(again.members.map((m) => m.user.id)).toContain(w.bat.user.id);
  });
});
