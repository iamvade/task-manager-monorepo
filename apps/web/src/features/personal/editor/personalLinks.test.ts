import { describe, expect, it, vi } from 'vitest';
import { linkSuggestions } from './personalLinks';

const items = [
  { id: 'a', title: 'Design ideas', kind: 'note' as const },
  { id: 'b', title: 'Ideas backlog', kind: 'todo' as const },
  { id: 'c', title: 'Groceries', kind: 'todo' as const },
];

describe('linkSuggestions', () => {
  it('lists matching items (prefix first), then create rows, then team tasks', async () => {
    const searchTasks = vi.fn(() =>
      Promise.resolve([{ type: 'task' as const, taskId: 't', key: 'APP-1', title: 'Ideas board' }]),
    );
    const rows = await linkSuggestions(
      'ide',
      { getItems: () => items, searchTasks },
      new AbortController().signal,
    );
    expect(rows.map((r) => (r.type === 'item' ? r.id : r.type))).toEqual([
      'b',
      'a',
      'create',
      'uncreated',
      'task',
    ]);
    expect(searchTasks).toHaveBeenCalledWith('ide', expect.anything());
  });

  it('offers no create rows for an exact title, and skips task search for one letter', async () => {
    const searchTasks = vi.fn(() => Promise.resolve([]));
    const exact = await linkSuggestions(
      'groceries',
      { getItems: () => items, searchTasks },
      new AbortController().signal,
    );
    expect(exact.map((r) => r.type)).toEqual(['item']);
    await linkSuggestions(
      'g',
      { getItems: () => items, searchTasks },
      new AbortController().signal,
    );
    expect(searchTasks).toHaveBeenCalledTimes(1);
  });
});
