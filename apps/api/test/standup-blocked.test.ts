import { taskDetailSchema, taskListItemSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { tasks } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

const clock = testClock('2026-10-08T01:20:00Z'); // Thursday 09:20 in Ulaanbaatar

describe('the "Blocked" marker from standup blockers', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('follows open blockers, with the text for group members only', async () => {
    const w = await standupWorld(ctx);
    const task = await w.createTask({ title: 'Tab bar' });
    const [before] = await ctx.db.select().from(tasks).where(eq(tasks.id, task.id));
    const activityBefore = (await w.activities(task.id)).length;
    type Api = typeof w.api;
    const listed = async (api: Api) =>
      z
        .array(taskListItemSchema)
        .parse((await api('GET', `/projects/${w.project.id}/tasks`)).json())
        .find((t) => t.id === task.id)?.blocked;
    const inSpace = async (api: Api) =>
      z
        .array(taskListItemSchema)
        .parse((await api('GET', `/spaces/${w.space.id}/tasks`)).json())
        .find((t) => t.id === task.id)?.blocked;
    const detail = async (api: Api) =>
      taskDetailSchema.parse((await api('GET', `/tasks/${task.key}`)).json()).blocked;

    // A draft doesn't mark anything.
    await w.save(w.sara.api, {
      status: 'draft',
      blockers: [{ text: 'Waiting on final tab icons', taskId: task.id }],
    });
    expect(await listed(w.api)).toBeNull();

    const entry = await w.post(w.sara.api, {
      blockers: [{ text: 'Waiting on final tab icons', taskId: task.id }],
    });
    const blockerId = entry.blockers[0]?.id;
    const full = {
      groupId: w.group.id,
      groupName: 'Mobile team',
      date: '2026-10-08',
      text: 'Waiting on final tab icons',
      fromUser: { id: w.sara.user.id, name: 'Sara Khan' },
    };
    for (const read of [listed, inSpace, detail]) {
      expect(await read(w.dorj.api)).toMatchObject(full);
      // Outside the group: that it's blocked and where from, not what it says.
      expect(await read(w.oyun.api)).toEqual({ ...full, text: null, fromUser: null });
    }

    // Linking a task from a standup leaves the task's history and updatedAt alone.
    const [after] = await ctx.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(await w.activities(task.id)).toHaveLength(activityBefore);

    expect((await w.dorj.api('POST', `/standup-blockers/${blockerId}/resolve`)).statusCode).toBe(
      403,
    );
    await w.sara.api('POST', `/standup-blockers/${blockerId}/resolve`);
    expect(await listed(w.dorj.api)).toBeNull();
    await w.sara.api('DELETE', `/standup-blockers/${blockerId}/resolve`);
    expect(await listed(w.dorj.api)).toMatchObject(full);

    // The group setting turns it off; so does archiving the group.
    await w.api('PATCH', `/standup-groups/${w.group.id}`, { markLinkedTasksBlocked: false });
    expect(await listed(w.dorj.api)).toBeNull();
    await w.api('PATCH', `/standup-groups/${w.group.id}`, { markLinkedTasksBlocked: true });
    expect(await listed(w.dorj.api)).toMatchObject(full);
    await w.api('POST', `/standup-groups/${w.group.id}/archive`);
    expect(await listed(w.dorj.api)).toBeNull();
    await w.api('POST', `/standup-groups/${w.group.id}/restore`);

    // Removing the blocker from the update clears it too.
    await w.post(w.sara.api, { blockers: [] });
    expect(await listed(w.dorj.api)).toBeNull();
  });

  it('broadcasts which tasks changed, without the text', async () => {
    const w = await standupWorld(ctx);
    const task = await w.createTask({ title: 'Payments' });
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      const entry = await w.post(w.dorj.api, {
        blockers: [{ text: 'Sandbox keys', taskId: task.id, helperIds: [w.bat.user.id] }],
      });
      const sent = publish.mock.calls.map(([e]) => e);
      const blocked = sent.find((e) => e.message.type === 'tasks.blocked.changed');
      expect(blocked).toMatchObject({
        to: { workspaceId: w.ws.id },
        message: { taskIds: [task.id] },
      });
      expect(JSON.stringify(blocked)).not.toContain('Sandbox');

      const posted = sent.find((e) => e.message.type === 'standup.entry_posted');
      expect(posted?.to).toEqual({
        workspaceId: w.ws.id,
        userIds: [w.owner.id, w.bat.user.id, w.sara.user.id, w.dorj.user.id],
      });
      expect(posted?.message).toMatchObject({
        groupId: w.group.id,
        date: '2026-10-08',
        entryId: entry.id,
        actorId: w.dorj.user.id,
      });

      publish.mockClear();
      await w.sara.api('PUT', `/standup-entries/${entry.id}/reactions/eyes`);
      await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'On it' });
      await w.bat.api('POST', `/standup-blockers/${entry.blockers[0]?.id}/resolve`);
      await w.post(w.dorj.api, {
        today: [{ kind: 'text', text: 'More' }],
        blockers: [
          {
            id: entry.blockers[0]?.id,
            text: 'Sandbox keys',
            taskId: task.id,
            helperIds: [w.bat.user.id],
          },
        ],
      });
      const types = publish.mock.calls
        .map(([e]) => e)
        .filter((e) => 'userIds' in e.to)
        .map((e) => e.message.type);
      expect(types).toEqual([
        'standup.reaction',
        'standup.reply',
        'standup.blocker_changed',
        'standup.entry_updated',
      ]);
    } finally {
      publish.mockRestore();
    }
  });
});
