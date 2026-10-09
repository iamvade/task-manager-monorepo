import { describe, expect, it } from 'vitest';
import { at, makeTasks, STATUSES } from '../../test/tasks';
import { groupTasks, sortTasks } from './grouping';
import { placeInStatus } from './positions';

const rank = new Map(STATUSES.map((s, i) => [s.id, i]));
const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

describe('sortTasks', () => {
  it('orders by due date with undated tasks last', () => {
    const tasks = makeTasks();
    tasks[0] = { ...at(tasks, 0), dueDate: null };
    const sorted = sortTasks(tasks, 'due', rank);
    expect(sorted[0]?.title).toBe('Release notes');
    expect(sorted.at(-1)?.title).toBe('Audit current navigation patterns');
  });

  it('orders by priority (urgent first), then position', () => {
    expect(titles(sortTasks(makeTasks(), 'priority', rank)).slice(0, 2)).toEqual([
      'Implement new bottom tab bar',
      'Checkout page — responsive layout',
    ]);
  });

  it('manual = status position, then position; space lists keep server order', () => {
    const tasks = makeTasks().reverse();
    expect(sortTasks(tasks, 'manual', rank)[0]?.title).toBe('Audit current navigation patterns');
    expect(sortTasks(tasks, 'manual', null)[0]?.title).toBe('Release notes');
  });
});

describe('groupTasks', () => {
  it('shows every project status, done collapsed by default', () => {
    const groups = groupTasks(makeTasks(), 'status', { statuses: STATUSES });
    expect(groups.map((g) => [g.labelKey, g.tasks.length, g.defaultCollapsed])).toEqual([
      ['status.todo', 2, false],
      ['status.in_progress', 2, false],
      ['status.review', 2, false],
      ['status.done', 1, true],
    ]);
    expect(groups[1]?.defaults).toEqual({ statusId: STATUSES[1]?.id });
  });

  it('groups the space list by category without inline add', () => {
    const groups = groupTasks(makeTasks(), 'status', { statuses: null });
    expect(groups.map((g) => g.key)).toEqual([
      'category:todo',
      'category:in_progress',
      'category:review',
      'category:done',
    ]);
    expect(groups.every((g) => g.defaults === null)).toBe(true);
  });

  it('puts a task with two assignees in both groups', () => {
    const groups = groupTasks(makeTasks(), 'assignee', { statuses: STATUSES });
    const anu = groups.find((g) => g.name === 'Anu Bold');
    expect(titles(anu?.tasks ?? [])).toEqual([
      'Redesign onboarding flow',
      'Checkout page — responsive layout',
      'Release notes',
    ]);
    expect(anu?.defaults).toEqual({ assigneeIds: [anu?.tasks[0]?.assignees[0]?.id] });
  });

  it('drops empty priority groups', () => {
    const groups = groupTasks(makeTasks(), 'priority', { statuses: STATUSES });
    expect(groups.map((g) => g.key)).toEqual([
      'priority:urgent',
      'priority:high',
      'priority:medium',
      'priority:low',
      'priority:none',
    ]);
    const none = groupTasks(makeTasks().slice(0, 2), 'priority', { statuses: STATUSES });
    expect(none.map((g) => g.key)).toEqual(['priority:medium', 'priority:low']);
  });
});

describe('placeInStatus', () => {
  const todo = () => makeTasks().filter((t) => t.status.category === 'todo');

  it('places after the visual previous row, using position order', () => {
    const [a, b] = [at(todo(), 0), at(todo(), 1)];
    const placed = placeInStatus(todo(), 'x', a.id, null);
    expect(placed).toMatchObject({ prevId: a.id, nextId: b.id });
    expect(placed.position > a.position && placed.position < b.position).toBe(true);
  });

  it('places before the next row or at the end', () => {
    const [a, b] = [at(todo(), 0), at(todo(), 1)];
    expect(placeInStatus(todo(), 'x', null, a.id)).toMatchObject({ prevId: null, nextId: a.id });
    expect(placeInStatus(todo(), 'x', null, null)).toMatchObject({ prevId: b.id, nextId: null });
  });

  it('ignores the moved task itself', () => {
    const [a, b] = [at(todo(), 0), at(todo(), 1)];
    expect(placeInStatus(todo(), a.id, b.id, null)).toMatchObject({
      prevId: b.id,
      nextId: null,
    });
  });
});
