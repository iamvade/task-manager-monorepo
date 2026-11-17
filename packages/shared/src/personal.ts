import type { NodeCheck, RichTextNode } from './rich-text.js';
import { makeRichTextDocSchema } from './rich-text.js';

/**
 * Personal space links (Obsidian-style `[[links]]`), shared by the API (link rows, backlinks) and
 * the web (rendering, graph, helpers), so both resolve a link the same way.
 *
 * Two node types exist only in personal notes:
 * - `itemLink` `{ id: uuid | null, title }`: a note or to-do. `id` is set when picked; the link
 *   shows the item's current title. Without a live `id` it resolves by title (case-insensitive,
 *   oldest first), else it's a note that doesn't exist yet.
 * - `taskLink` `{ taskId, key }`: a team task, by id (keys repeat across workspaces).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PERSONAL_LINK_TITLE_MAX = 200;
const TASK_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,9}$/;

const checkItemLink: NodeCheck = (node) => {
  const id = node.attrs?.id;
  const title = node.attrs?.title;
  if (id !== null && id !== undefined && (typeof id !== 'string' || !UUID.test(id))) {
    return 'itemLink needs a uuid id or null';
  }
  if (typeof title !== 'string' || title.trim() === '' || title.length > PERSONAL_LINK_TITLE_MAX) {
    return 'itemLink needs a title';
  }
  if (node.content?.length) return 'itemLink has no content';
  return null;
};

const checkTaskLink: NodeCheck = (node) => {
  const taskId = node.attrs?.taskId;
  const key = node.attrs?.key;
  if (typeof taskId !== 'string' || !UUID.test(taskId)) return 'taskLink needs a uuid taskId';
  if (typeof key !== 'string' || !TASK_KEY.test(key)) return 'taskLink needs a task key';
  if (node.content?.length) return 'taskLink has no content';
  return null;
};

export const PERSONAL_NODE_CHECKS: ReadonlyMap<string, NodeCheck> = new Map([
  ['itemLink', checkItemLink],
  ['taskLink', checkTaskLink],
]);

/** A personal note's body: the usual editor nodes plus `itemLink` and `taskLink`. */
export const personalDocSchema = makeRichTextDocSchema(PERSONAL_NODE_CHECKS);

/** A link as written in a body (before resolving). */
export interface WrittenLink {
  targetItemId: string | null;
  targetTaskId: string | null;
  /** The title stored in the link (the task's key for tasks). */
  title: string;
}

/** The links of a body, deduplicated (same target once), in document order. */
export function extractPersonalLinks(doc: RichTextNode | null | undefined): WrittenLink[] {
  const out = new Map<string, WrittenLink>();
  const walk = (n: RichTextNode) => {
    if (n.type === 'itemLink') {
      const id = typeof n.attrs?.id === 'string' ? n.attrs.id.toLowerCase() : null;
      const title = typeof n.attrs?.title === 'string' ? n.attrs.title.trim() : '';
      if (title) {
        const key = id ? `i:${id}` : `t:${titleKey(title)}`;
        if (!out.has(key)) out.set(key, { targetItemId: id, targetTaskId: null, title });
      }
    } else if (n.type === 'taskLink') {
      const taskId = typeof n.attrs?.taskId === 'string' ? n.attrs.taskId.toLowerCase() : null;
      const key = typeof n.attrs?.key === 'string' ? n.attrs.key : '';
      if (taskId && !out.has(`k:${taskId}`)) {
        out.set(`k:${taskId}`, { targetItemId: null, targetTaskId: taskId, title: key });
      }
    }
    for (const child of n.content ?? []) walk(child);
  };
  if (doc) walk(doc);
  return [...out.values()];
}

/** Titles match case-insensitively, ignoring surrounding and repeated spaces. */
export const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** What resolving needs of an item. */
export interface LinkableItem {
  id: string;
  title: string;
  createdAt: string;
}

/** What resolving needs of a team task. */
export interface LinkableTask {
  id: string;
}

export type ResolvedLink<I extends LinkableItem, T extends LinkableTask> =
  | { kind: 'item'; item: I }
  | { kind: 'task'; task: T }
  | { kind: 'uncreated'; title: string }
  | { kind: 'unavailable'; taskId: string; key: string };

/** Looks items and tasks up for `resolveLink`. Build once per index. */
export function linkResolver<I extends LinkableItem, T extends LinkableTask>(
  items: readonly I[],
  tasks: readonly T[],
) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const byTitle = new Map<string, I>();
  const oldestFirst = [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
  );
  for (const item of oldestFirst) {
    const key = titleKey(item.title);
    if (!byTitle.has(key)) byTitle.set(key, item);
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return (link: WrittenLink): ResolvedLink<I, T> => {
    if (link.targetTaskId) {
      const task = taskById.get(link.targetTaskId);
      return task
        ? { kind: 'task', task }
        : { kind: 'unavailable', taskId: link.targetTaskId, key: link.title };
    }
    const picked = link.targetItemId ? byId.get(link.targetItemId) : undefined;
    if (picked) return { kind: 'item', item: picked };
    const named = byTitle.get(titleKey(link.title));
    return named ? { kind: 'item', item: named } : { kind: 'uncreated', title: link.title };
  };
}

interface SourcedLink extends WrittenLink {
  sourceId: string;
}

/** Items whose links lead to `itemId` (a note linking to itself is left out), by title. */
export function backlinksOf<I extends LinkableItem>(
  itemId: string,
  items: readonly I[],
  links: readonly SourcedLink[],
): I[] {
  const resolve = linkResolver(items, []);
  const byId = new Map(items.map((i) => [i.id, i]));
  const sources = new Set<string>();
  for (const link of links) {
    if (link.sourceId === itemId || link.targetTaskId) continue;
    const r = resolve(link);
    if (r.kind === 'item' && r.item.id === itemId) sources.add(link.sourceId);
  }
  return [...sources]
    .map((id) => byId.get(id))
    .filter((i): i is I => i !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export type GraphNode =
  | { id: string; kind: 'item'; itemId: string }
  | { id: string; kind: 'task'; taskId: string }
  | { id: string; kind: 'uncreated'; title: string }
  | { id: string; kind: 'unavailable'; taskId: string; key: string };

export interface GraphEdge {
  source: string;
  target: string;
}

export interface PersonalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The graph of items and what they link to. `include` limits which items are shown (a topic);
 * linked items outside it still appear, so a link never points at nothing.
 */
export function buildPersonalGraph<I extends LinkableItem>(
  items: readonly I[],
  tasks: readonly LinkableTask[],
  links: readonly SourcedLink[],
  include: (item: I) => boolean = () => true,
): PersonalGraph {
  const resolve = linkResolver(items, tasks);
  const live = new Set(items.map((i) => i.id));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const itemNode = (id: string) => {
    const nodeId = `item:${id}`;
    if (!nodes.has(nodeId)) nodes.set(nodeId, { id: nodeId, kind: 'item', itemId: id });
    return nodeId;
  };
  for (const item of items) if (include(item)) itemNode(item.id);
  for (const link of links) {
    if (!live.has(link.sourceId)) continue;
    const source = items.find((i) => i.id === link.sourceId);
    if (!source || !include(source)) continue;
    const r = resolve(link);
    let target: string;
    if (r.kind === 'item') {
      if (r.item.id === link.sourceId) continue;
      target = itemNode(r.item.id);
    } else if (r.kind === 'task') {
      target = `task:${r.task.id}`;
      if (!nodes.has(target)) nodes.set(target, { id: target, kind: 'task', taskId: r.task.id });
    } else if (r.kind === 'unavailable') {
      target = `task:${r.taskId}`;
      if (!nodes.has(target)) {
        nodes.set(target, { id: target, kind: 'unavailable', taskId: r.taskId, key: r.key });
      }
    } else {
      target = `new:${titleKey(r.title)}`;
      if (!nodes.has(target)) nodes.set(target, { id: target, kind: 'uncreated', title: r.title });
    }
    const source_ = `item:${link.sourceId}`;
    const key = [source_, target].sort().join('|');
    if (!edges.has(key)) edges.set(key, { source: source_, target });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** Items with no links in or out (to items, tasks or notes not created yet). */
export function findUnlinked<I extends LinkableItem>(
  items: readonly I[],
  links: readonly SourcedLink[],
): I[] {
  const resolve = linkResolver(items, []);
  const live = new Set(items.map((i) => i.id));
  const linked = new Set<string>();
  for (const link of links) {
    if (!live.has(link.sourceId)) continue;
    const r = resolve(link);
    if (r.kind === 'item' && r.item.id === link.sourceId) continue;
    linked.add(link.sourceId);
    if (r.kind === 'item') linked.add(r.item.id);
  }
  return items.filter((i) => !linked.has(i.id));
}

export interface UncreatedTarget {
  title: string;
  /** Items linking to it, by id. */
  sourceIds: string[];
}

/** Links to notes that don't exist yet, one row per title, most linked first. */
export function findUncreated(
  items: readonly LinkableItem[],
  links: readonly SourcedLink[],
): UncreatedTarget[] {
  const resolve = linkResolver(items, []);
  const live = new Set(items.map((i) => i.id));
  const byTitle = new Map<string, UncreatedTarget>();
  for (const link of links) {
    if (link.targetTaskId || !live.has(link.sourceId)) continue;
    const r = resolve(link);
    if (r.kind !== 'uncreated') continue;
    const key = titleKey(r.title);
    const row = byTitle.get(key) ?? { title: r.title, sourceIds: [] };
    if (!row.sourceIds.includes(link.sourceId)) row.sourceIds.push(link.sourceId);
    byTitle.set(key, row);
  }
  return [...byTitle.values()].sort(
    (a, b) => b.sourceIds.length - a.sourceIds.length || a.title.localeCompare(b.title),
  );
}
