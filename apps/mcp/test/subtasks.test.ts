import { ME } from '@kite/shared/testing';
import { describe, expect, it } from 'vitest';
import { BAT, DETAIL, TASK, connect, writes } from './harness.js';

const sub = (n: number, title: string, done = false) => ({
  id: `01890000-0000-7000-8000-00000000050${n}`,
  title,
  assignee: null,
  dueDate: null,
  done,
  position: `a${n}`,
});
const SUBS = [sub(1, 'Write tests'), sub(2, 'Review copy', true), sub(3, 'Ship')];
const WITH_SUBS = {
  ...DETAIL,
  subtasks: SUBS,
  subtaskProgress: { done: 1, total: 3 },
};
const routes = (extra: Record<string, (body: unknown) => unknown> = {}) => ({
  [`GET /tasks/${TASK.key}`]: () => WITH_SUBS,
  ...extra,
});

describe('add_subtask', () => {
  it('resolves the assignee and due date, then posts to the task', async () => {
    const { call, calls } = await connect(
      routes({
        [`POST /tasks/${TASK.id}/subtasks`]: () =>
          Response.json(
            { ...sub(4, 'Update docs'), assignee: BAT, dueDate: '2026-11-20' },
            { status: 201 },
          ),
      }),
    );
    const res = await call('add_subtask', {
      key: TASK.key,
      title: 'Update docs',
      assignee: 'bat',
      due_date: '2026-11-20',
    });
    expect(res.isError, res.text).toBe(false);
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: `/tasks/${TASK.id}/subtasks`,
        body: { title: 'Update docs', assigneeId: BAT.id, dueDate: '2026-11-20' },
      }),
    ]);
    expect(res.text).toMatch(/^Added subtask 4 to .*: Update docs \(Bat Ochir, due 2026-11-20\)/);
  });

  it('writes nothing for an unknown person or a bad date', async () => {
    const { call, calls } = await connect(routes());
    const who = await call('add_subtask', { key: TASK.key, title: 'x', assignee: 'Nobody' });
    expect(who.text).toMatch(/Nobody called "Nobody"/);
    const when = await call('add_subtask', { key: TASK.key, title: 'x', due_date: '2026-02-30' });
    expect(when.text).toMatch(/not a real date/);
    expect(writes(calls)).toEqual([]);
  });

  it('"me" assigns myself', async () => {
    const { call, calls } = await connect(
      routes({
        [`POST /tasks/${TASK.id}/subtasks`]: () => ({ ...sub(4, 'Mine'), assignee: ME.user }),
      }),
    );
    await call('add_subtask', { key: TASK.key, title: 'Mine', assignee: 'me' });
    expect(writes(calls)[0]?.body).toEqual({ title: 'Mine', assigneeId: ME.user.id });
  });
});

describe('complete_subtask', () => {
  const patch = (n: number, done: boolean) => ({
    [`PATCH /subtasks/${sub(n, '').id}`]: () => ({ ...SUBS[n - 1], done }),
  });

  it('checks off by position', async () => {
    const { call, calls } = await connect(routes(patch(3, true)));
    const res = await call('complete_subtask', { key: TASK.key, subtask: 3 });
    expect(res.isError, res.text).toBe(false);
    expect(writes(calls)).toEqual([
      expect.objectContaining({ path: `/subtasks/${SUBS[2]?.id}`, body: { done: true } }),
    ]);
    expect(res.text).toBe(`Checked off "Ship" on ${TASK.key} (2/3 done)`);
  });

  it('checks off by title, whatever the case', async () => {
    const { call, calls } = await connect(routes(patch(1, true)));
    const res = await call('complete_subtask', { key: TASK.key, subtask: 'write  TESTS' });
    expect(res.isError, res.text).toBe(false);
    expect(writes(calls)[0]?.path).toBe(`/subtasks/${SUBS[0]?.id}`);
  });

  it('unchecks with done: false', async () => {
    const { call, calls } = await connect(routes(patch(2, false)));
    const res = await call('complete_subtask', { key: TASK.key, subtask: '#2', done: false });
    expect(writes(calls)[0]?.body).toEqual({ done: false });
    expect(res.text).toBe(`Unchecked "Review copy" on ${TASK.key} (0/3 done)`);
  });

  it('writes nothing when it is already in that state', async () => {
    const { call, calls } = await connect(routes());
    const res = await call('complete_subtask', { key: TASK.key, subtask: 'Review copy' });
    expect(res.isError).toBe(false);
    expect(res.text).toMatch(/^Already done/);
    expect(writes(calls)).toEqual([]);
  });

  it('lists the subtasks when nothing matches or the position is out of range', async () => {
    const { call, calls } = await connect(routes());
    for (const subtask of ['Deploy', 9]) {
      const res = await call('complete_subtask', { key: TASK.key, subtask });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/Subtasks: 1\. Write tests; 2\. Review copy; 3\. Ship\./);
    }
    expect(writes(calls)).toEqual([]);
  });

  it('asks for the position when several subtasks share a title', async () => {
    const twins = { ...WITH_SUBS, subtasks: [sub(1, 'Test'), sub(2, 'test')] };
    const { call, calls } = await connect({ [`GET /tasks/${TASK.key}`]: () => twins });
    const res = await call('complete_subtask', { key: TASK.key, subtask: 'Test' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(
      /Several subtasks are called "Test". Use the position: 1\. Test; 2\. test/,
    );
    expect(writes(calls)).toEqual([]);
  });

  it('says so when the task has no subtasks', async () => {
    const { call } = await connect({});
    const res = await call('complete_subtask', { key: TASK.key, subtask: 1 });
    expect(res.text).toBe('This task has no subtasks.');
  });
});

describe('get_task', () => {
  it('numbers the subtasks so a position can be used', async () => {
    const { call } = await connect(routes({ [`GET /tasks/${TASK.id}/comments`]: () => [] }));
    const res = await call('get_task', { key: TASK.key });
    expect(res.text).toContain('- 1. [ ] Write tests\n- 2. [x] Review copy\n- 3. [ ] Ship');
  });
});
