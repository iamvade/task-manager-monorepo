import { describe, expect, it } from 'vitest';
import {
  backlinksOf,
  buildPersonalGraph,
  extractPersonalLinks,
  findUncreated,
  findUnlinked,
  linkResolver,
  personalDocSchema,
} from './personal.js';
import { richTextDocSchema, richTextToPlain } from './rich-text.js';

const A = '01890000-0000-7000-8000-00000000000a';
const B = '01890000-0000-7000-8000-00000000000b';
const C = '01890000-0000-7000-8000-00000000000c';
const T = '01890000-0000-7000-8000-0000000000aa';

const item = (id: string, title: string, createdAt = '2026-11-01T00:00:00.000Z') => ({
  id,
  title,
  createdAt,
});
const para = (...content: object[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});
const itemLink = (id: string | null, title: string) => ({ type: 'itemLink', attrs: { id, title } });
const taskLink = (taskId: string, key: string) => ({ type: 'taskLink', attrs: { taskId, key } });

describe('personalDocSchema', () => {
  it('accepts link nodes that team documents refuse', () => {
    const doc = para({ type: 'text', text: 'See ' }, itemLink(A, 'Ideas'), taskLink(T, 'APP-142'));
    expect(personalDocSchema.safeParse(doc).success).toBe(true);
    expect(richTextDocSchema.safeParse(doc).success).toBe(false);
  });

  it('checks link attrs', () => {
    expect(personalDocSchema.safeParse(para(itemLink('nope', 'X'))).success).toBe(false);
    expect(personalDocSchema.safeParse(para(itemLink(null, '  '))).success).toBe(false);
    expect(personalDocSchema.safeParse(para(itemLink(null, 'New idea'))).success).toBe(true);
    expect(personalDocSchema.safeParse(para(taskLink(T, 'not a key'))).success).toBe(false);
    expect(personalDocSchema.safeParse(para(taskLink('x', 'APP-1'))).success).toBe(false);
  });

  it('renders links as text for search', () => {
    expect(
      richTextToPlain(
        para(itemLink(A, 'Ideas'), { type: 'text', text: ' ' }, taskLink(T, 'APP-1')),
      ),
    ).toBe('Ideas APP-1');
  });
});

describe('extractPersonalLinks', () => {
  it('dedupes by target', () => {
    const doc = para(
      itemLink(A, 'Ideas'),
      itemLink(A, 'Ideas (old title)'),
      itemLink(null, 'Later'),
      itemLink(null, ' later '),
      taskLink(T, 'APP-1'),
      taskLink(T, 'APP-1'),
    );
    expect(extractPersonalLinks(doc)).toEqual([
      { targetItemId: A, targetTaskId: null, title: 'Ideas' },
      { targetItemId: null, targetTaskId: null, title: 'Later' },
      { targetItemId: null, targetTaskId: T, title: 'APP-1' },
    ]);
  });
});

describe('linkResolver', () => {
  const items = [
    item(A, 'Ideas', '2026-11-02T00:00:00.000Z'),
    item(B, 'ideas', '2026-11-01T00:00:00.000Z'),
  ];
  const resolve = linkResolver(items, [{ id: T }]);

  it('prefers the picked id, then the oldest title match', () => {
    expect(resolve({ targetItemId: A, targetTaskId: null, title: 'whatever' })).toMatchObject({
      kind: 'item',
      item: { id: A },
    });
    expect(resolve({ targetItemId: null, targetTaskId: null, title: 'IDEAS' })).toMatchObject({
      kind: 'item',
      item: { id: B },
    });
    // A picked note that was deleted falls back to its stored title.
    expect(resolve({ targetItemId: C, targetTaskId: null, title: 'Gone' })).toEqual({
      kind: 'uncreated',
      title: 'Gone',
    });
  });

  it('marks tasks I cannot see as unavailable', () => {
    expect(resolve({ targetItemId: null, targetTaskId: T, title: 'APP-1' })).toMatchObject({
      kind: 'task',
    });
    expect(resolve({ targetItemId: null, targetTaskId: C, title: 'APP-2' })).toEqual({
      kind: 'unavailable',
      taskId: C,
      key: 'APP-2',
    });
  });
});

describe('backlinks, graph and helpers', () => {
  const items = [item(A, 'Ideas'), item(B, 'Plan'), item(C, 'Lonely')];
  const links = [
    { sourceId: B, targetItemId: A, targetTaskId: null, title: 'Ideas' },
    { sourceId: B, targetItemId: null, targetTaskId: null, title: 'Someday' },
    { sourceId: A, targetItemId: null, targetTaskId: null, title: 'someday' },
    { sourceId: A, targetItemId: A, targetTaskId: null, title: 'Ideas' },
    { sourceId: A, targetItemId: null, targetTaskId: T, title: 'APP-1' },
  ];

  it('lists backlinks without self-links', () => {
    expect(backlinksOf(A, items, links).map((i) => i.id)).toEqual([B]);
    expect(backlinksOf(B, items, links)).toEqual([]);
  });

  it('builds a graph with uncreated and task nodes', () => {
    const g = buildPersonalGraph(items, [{ id: T }], links);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(
      [`item:${A}`, `item:${B}`, `item:${C}`, 'new:someday', `task:${T}`].sort(),
    );
    expect(g.edges).toHaveLength(4);
  });

  it('limits the graph to a topic but keeps linked targets', () => {
    const g = buildPersonalGraph(items, [], links, (i) => i.id === B);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(
      [`item:${A}`, `item:${B}`, 'new:someday'].sort(),
    );
  });

  it('finds unlinked items and notes not created yet', () => {
    expect(findUnlinked(items, links).map((i) => i.id)).toEqual([C]);
    expect(findUncreated(items, links)).toEqual([{ title: 'Someday', sourceIds: [B, A] }]);
  });
});
