import { taskListItemSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { one } from '../src/db/rows.js';
import {
  attachments,
  comments,
  projects,
  sprints,
  subtasks,
  tags,
} from '../src/db/schema/index.js';
import { addMember, createSpace, createUser } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('listing tasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let world: Awaited<ReturnType<typeof taskWorld>>;
  let saraId: string;
  let researchId: string;
  let uxId: string;
  let sprintId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    world = await taskWorld(ctx);
    const { ws, project, status, createTask, owner } = world;
    const sara = await createUser(ctx.db, { name: 'Sara K.' });
    await addMember(ctx.db, ws.id, sara.id);
    saraId = sara.id;
    const [research, ux] = await ctx.db
      .insert(tags)
      .values([
        { workspaceId: ws.id, name: 'Research', color: 'blue' },
        { workspaceId: ws.id, name: 'UX/UI', color: 'violet' },
      ])
      .returning();
    researchId = research?.id ?? '';
    uxId = ux?.id ?? '';
    sprintId = one(
      await ctx.db
        .insert(sprints)
        .values({
          projectId: project.id,
          name: 'S',
          startDate: '2026-10-06',
          endDate: '2026-10-24',
        })
        .returning(),
    ).id;

    // Created in this order; titles say what matters for the assertions.
    await createTask({
      title: 'Checkout page — responsive layout',
      priority: 'high',
      dueDate: '2026-10-14',
      assigneeIds: [sara.id],
      tagIds: [uxId],
      sprintId,
      statusId: status('in_progress').id,
    });
    await createTask({
      title: 'Onboarding flow',
      priority: 'urgent',
      dueDate: '2026-10-08',
      assigneeIds: [owner.id, sara.id],
      tagIds: [researchId, uxId],
    });
    await createTask({ title: 'Payment icons', priority: 'low' });
    await createTask({
      title: 'Release notes 100%_done',
      priority: 'medium',
      dueDate: '2026-10-20',
      statusId: status('done').id,
      assigneeIds: [owner.id],
    });
    await createTask({ title: 'Empty state copy', dueDate: '2026-10-01', sprintId });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('defaults to board order (status, then position) with done included', async () => {
    expect(await world.titles()).toEqual([
      'Onboarding flow',
      'Payment icons',
      'Empty state copy',
      'Checkout page — responsive layout',
      'Release notes 100%_done',
    ]);
  });

  it('filters', async () => {
    const t = world.titles;
    const { status, owner } = world;
    expect(await t(`?statusId=${status('in_progress').id}&statusId=${status('done').id}`)).toEqual([
      'Checkout page — responsive layout',
      'Release notes 100%_done',
    ]);
    expect(await t(`?assigneeId=${saraId}`)).toEqual([
      'Onboarding flow',
      'Checkout page — responsive layout',
    ]);
    expect(await t('?assigneeId=unassigned')).toEqual(['Payment icons', 'Empty state copy']);
    expect(await t(`?assigneeId=unassigned&assigneeId=${owner.id}`)).toEqual([
      'Onboarding flow',
      'Payment icons',
      'Empty state copy',
      'Release notes 100%_done',
    ]);
    expect(await t(`?tagId=${researchId}`)).toEqual(['Onboarding flow']);
    expect(await t(`?tagId=${researchId}&tagId=${uxId}`)).toEqual([
      'Onboarding flow',
      'Checkout page — responsive layout',
    ]);
    expect(await t('?priority=urgent&priority=low')).toEqual(['Onboarding flow', 'Payment icons']);
    expect(await t(`?sprintId=${sprintId}`)).toEqual([
      'Empty state copy',
      'Checkout page — responsive layout',
    ]);
    expect(await t('?dueFrom=2026-10-08&dueTo=2026-10-14')).toEqual([
      'Onboarding flow',
      'Checkout page — responsive layout',
    ]);
    expect(await t('?hasDueDate=false')).toEqual(['Payment icons']);
    expect(await t('?hasDueDate=true&includeDone=false')).toEqual([
      'Onboarding flow',
      'Empty state copy',
      'Checkout page — responsive layout',
    ]);
    // Substring, case-insensitive; LIKE wildcards are literal.
    expect(await t('?q=CHECKOUT')).toEqual(['Checkout page — responsive layout']);
    expect(await t('?q=100%25_')).toEqual(['Release notes 100%_done']);
    expect(await t('?q=%25')).toEqual(['Release notes 100%_done']);
    // Fuzzy word match (trigram).
    expect(await t('?q=onboardng')).toEqual(['Onboarding flow']);
    // Filters combine with AND.
    expect(await t(`?assigneeId=${saraId}&priority=urgent`)).toEqual(['Onboarding flow']);
  });

  it('rejects malformed filters', async () => {
    for (const query of ['?statusId=nope', '?priority=extreme', '?dueFrom=10/08', '?sort=title']) {
      expect(
        (await world.api('GET', `/projects/${world.project.id}/tasks${query}`)).statusCode,
      ).toBe(400);
    }
  });

  it('sorts', async () => {
    const t = world.titles;
    expect(await t('?sort=dueDate')).toEqual([
      'Empty state copy',
      'Onboarding flow',
      'Checkout page — responsive layout',
      'Release notes 100%_done',
      'Payment icons',
    ]);
    expect(await t('?sort=dueDate&dir=desc')).toEqual([
      'Release notes 100%_done',
      'Checkout page — responsive layout',
      'Onboarding flow',
      'Empty state copy',
      'Payment icons',
    ]);
    expect(await t('?sort=priority')).toEqual([
      'Onboarding flow',
      'Checkout page — responsive layout',
      'Release notes 100%_done',
      'Payment icons',
      'Empty state copy',
    ]);
    expect(await t('?sort=createdAt&dir=desc')).toEqual([
      'Empty state copy',
      'Release notes 100%_done',
      'Payment icons',
      'Onboarding flow',
      'Checkout page — responsive layout',
    ]);
  });

  it('returns keys, people, tags and counts in one row', async () => {
    const { api, createTask, owner, list } = world;
    const task = await createTask({
      title: 'Counted',
      assigneeIds: [saraId, owner.id],
      tagIds: [uxId, researchId],
    });
    await ctx.db.insert(subtasks).values([
      { taskId: task.id, title: 'a', done: true, position: 'a0' },
      { taskId: task.id, title: 'b', done: true, position: 'a1' },
      { taskId: task.id, title: 'c', done: false, position: 'a2' },
    ]);
    const body = { type: 'doc' };
    await ctx.db.insert(comments).values([
      { taskId: task.id, authorId: owner.id, body },
      { taskId: task.id, authorId: owner.id, body },
      { taskId: task.id, authorId: owner.id, body, deletedAt: new Date() },
    ]);
    await ctx.db.insert(attachments).values({
      taskId: task.id,
      uploaderId: owner.id,
      filename: 'spec.pdf',
      mime: 'application/pdf',
      size: 1024,
      storageKey: 'k',
    });

    const item = (await list()).find((t) => t.id === task.id);
    expect(item).toMatchObject({
      key: `${world.project.key}-${task.number}`,
      assignees: [
        { id: owner.id, name: 'Anu Bold', initials: 'TU', avatarColor: 'indigo' },
        { id: saraId, name: 'Sara K.' },
      ],
      tags: [
        { id: researchId, name: 'Research', color: 'blue' },
        { id: uxId, name: 'UX/UI', color: 'violet' },
      ],
      subtaskProgress: { done: 2, total: 3 },
      commentCount: 2,
      attachmentCount: 1,
    });

    expect((await api('DELETE', `/tasks/${task.id}`)).statusCode).toBe(204);
    expect((await list()).some((t) => t.id === task.id)).toBe(false);
  });

  it('lists a space across its non-archived projects', async () => {
    const { api, ws, space, newProject, createTask } = world;
    const web = await newProject('Web');
    const old = await newProject('Old');
    const elsewhere = await newProject('Elsewhere', (await createSpace(ctx.db, ws.id, 'b0')).id);
    await createTask({ title: 'Web task', priority: 'urgent' }, web.id);
    await createTask({ title: 'Old task' }, old.id);
    await createTask({ title: 'Elsewhere task' }, elsewhere.id);
    await ctx.db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, old.id));

    const spaceList = async (query = '') => {
      const res = await api('GET', `/spaces/${space.id}/tasks${query}`);
      expect(res.statusCode, res.body).toBe(200);
      return z.array(taskListItemSchema).parse(res.json());
    };
    const all = await spaceList();
    expect(all.map((t) => t.title)).toEqual([...(await world.titles()), 'Web task']);
    expect(all.at(-1)?.project).toMatchObject({ id: web.id, name: 'Web', key: web.key });

    expect((await spaceList(`?projectId=${web.id}`)).map((t) => t.title)).toEqual(['Web task']);
    expect((await spaceList('?priority=urgent&sort=priority')).map((t) => t.title)).toEqual([
      'Onboarding flow',
      'Web task',
    ]);
  });
});
