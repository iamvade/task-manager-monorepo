import {
  backlinksOf,
  extractPersonalLinks,
  richTextToPlain,
  type PersonalIndex,
  type PersonalItem,
  type PersonalItemSummary,
  type PersonalLink,
  type PersonalTaskRef,
  type PersonalTopic,
  type RichTextNode,
} from '@kite/shared';
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { activeMember } from '../auth/membership.js';
import { requireAuth, type AuthContext } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import {
  personalItems,
  personalLinks,
  personalTopics,
  projects,
  tasks,
  workspaceMembers,
  workspaces,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';

const notFound = () => httpError(404, 'NOT_FOUND', 'Not found');

/**
 * The signed-in person, for personal routes. The platform admin has no personal space (404, like
 * every workspace route).
 */
export function requirePersonalOwner(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request);
  if (auth.user.platformRole !== null) throw notFound();
  return auth;
}

type ItemRow = typeof personalItems.$inferSelect;
type TopicRow = typeof personalTopics.$inferSelect;

export const toTopicDto = (t: TopicRow): PersonalTopic => ({
  id: t.id,
  name: t.name,
  color: t.color,
  position: t.position,
});

export const toItemSummary = (i: ItemRow): PersonalItemSummary => ({
  id: i.id,
  kind: i.kind,
  title: i.title,
  topicId: i.topicId,
  dueDate: i.dueDate,
  doneAt: i.doneAt?.toISOString() ?? null,
  position: i.position,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
});

/** My live (not deleted) item, else 404. `lock` takes the row lock (saves rebuild its links). */
export async function loadMyItem(
  db: DbOrTx,
  userId: string,
  itemId: string,
  options: { deleted?: boolean; lock?: boolean } = {},
): Promise<ItemRow> {
  const query = db
    .select()
    .from(personalItems)
    .where(
      and(
        eq(personalItems.id, itemId),
        eq(personalItems.userId, userId),
        options.deleted ? isNotNull(personalItems.deletedAt) : isNull(personalItems.deletedAt),
      ),
    );
  const [row] = options.lock ? await query.for('update') : await query;
  if (!row) throw notFound();
  return row;
}

export async function loadMyTopic(db: DbOrTx, userId: string, topicId: string): Promise<TopicRow> {
  const [row] = await db
    .select()
    .from(personalTopics)
    .where(and(eq(personalTopics.id, topicId), eq(personalTopics.userId, userId)));
  if (!row) throw notFound();
  return row;
}

/** A topic id from a request body: must be mine (400, so a foreign id isn't confirmed either way). */
export async function requireTopicRef(db: DbOrTx, userId: string, topicId: string | null) {
  if (topicId === null) return;
  const [row] = await db
    .select({ id: personalTopics.id })
    .from(personalTopics)
    .where(and(eq(personalTopics.id, topicId), eq(personalTopics.userId, userId)));
  if (!row) throw httpError(400, 'INVALID_REFERENCE', 'Unknown topic');
}

/**
 * Team tasks I can see now (live, in a workspace where I'm an active member), with what a link
 * shows. Tasks I can't see are simply missing.
 */
export async function visibleTasks(
  db: DbOrTx,
  userId: string,
  taskIds: readonly string[],
): Promise<PersonalTaskRef[]> {
  if (taskIds.length === 0) return [];
  const rows = await db
    .select({
      id: tasks.id,
      key: sql<string>`${projects.key} || '-' || ${tasks.number}`,
      title: tasks.title,
      closedAt: tasks.closedAt,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, projects.workspaceId),
        eq(workspaceMembers.userId, userId),
        activeMember,
      ),
    )
    .where(and(inArray(tasks.id, [...new Set(taskIds)]), isNull(tasks.deletedAt)));
  return rows.map(({ closedAt, ...r }) => ({ ...r, closed: closedAt !== null }));
}

/**
 * Rebuilds an item's link rows from its body (in the caller's transaction, under the item's row
 * lock). Newly linked team tasks must be visible to me (400 `INVALID_TASK`); links kept from
 * before stay even if the task has since become unavailable, so the note can still be saved.
 */
export async function syncPersonalLinks(
  tx: DbOrTx,
  userId: string,
  itemId: string,
  body: RichTextNode | null,
): Promise<void> {
  const written = extractPersonalLinks(body);
  const before = await tx
    .select({ targetTaskId: personalLinks.targetTaskId })
    .from(personalLinks)
    .where(eq(personalLinks.sourceItemId, itemId));
  const known = new Set(before.map((l) => l.targetTaskId).filter((id) => id !== null));
  const added = written
    .map((l) => l.targetTaskId)
    .filter((id): id is string => id !== null && !known.has(id));
  if (added.length > 0) {
    const visible = new Set((await visibleTasks(tx, userId, added)).map((t) => t.id));
    if (added.some((id) => !visible.has(id))) {
      throw httpError(400, 'INVALID_TASK', 'Linked task not found');
    }
  }
  // Picked items must be mine; a foreign or unknown id keeps only its title.
  const pickedIds = written.map((l) => l.targetItemId).filter((id): id is string => id !== null);
  const mine = new Set(
    pickedIds.length === 0
      ? []
      : (
          await tx
            .select({ id: personalItems.id })
            .from(personalItems)
            .where(and(inArray(personalItems.id, pickedIds), eq(personalItems.userId, userId)))
        ).map((r) => r.id),
  );
  await tx.delete(personalLinks).where(eq(personalLinks.sourceItemId, itemId));
  if (written.length === 0) return;
  await tx.insert(personalLinks).values(
    written.map((l) => ({
      userId,
      sourceItemId: itemId,
      targetItemId: l.targetItemId && mine.has(l.targetItemId) ? l.targetItemId : null,
      targetTaskId: l.targetTaskId,
      title: l.title,
    })),
  );
}

export const bodyText = (body: RichTextNode | null) => (body ? richTextToPlain(body) : '');

/** My live items (oldest first is irrelevant: callers sort by position). */
async function liveItems(db: DbOrTx, userId: string): Promise<ItemRow[]> {
  return db
    .select()
    .from(personalItems)
    .where(and(eq(personalItems.userId, userId), isNull(personalItems.deletedAt)))
    .orderBy(asc(personalItems.position), asc(personalItems.id));
}

/** The links of my live items. */
async function liveLinks(db: DbOrTx, userId: string): Promise<PersonalLink[]> {
  const rows = await db
    .select({
      sourceId: personalLinks.sourceItemId,
      targetItemId: personalLinks.targetItemId,
      targetTaskId: personalLinks.targetTaskId,
      title: personalLinks.title,
    })
    .from(personalLinks)
    .innerJoin(personalItems, eq(personalItems.id, personalLinks.sourceItemId))
    .where(and(eq(personalLinks.userId, userId), isNull(personalItems.deletedAt)))
    .orderBy(asc(personalLinks.createdAt), asc(personalLinks.id));
  return rows;
}

export async function personalIndex(db: DbOrTx, userId: string): Promise<PersonalIndex> {
  const [topics, items, links] = await Promise.all([
    db
      .select()
      .from(personalTopics)
      .where(eq(personalTopics.userId, userId))
      .orderBy(asc(personalTopics.position), asc(personalTopics.id)),
    liveItems(db, userId),
    liveLinks(db, userId),
  ]);
  const taskIds = links.map((l) => l.targetTaskId).filter((id): id is string => id !== null);
  return {
    topics: topics.map(toTopicDto),
    items: items.map(toItemSummary),
    links,
    tasks: await visibleTasks(db, userId, taskIds),
  };
}

export async function personalItemDetail(
  db: DbOrTx,
  userId: string,
  item: ItemRow,
): Promise<PersonalItem> {
  const [items, links] = await Promise.all([liveItems(db, userId), liveLinks(db, userId)]);
  const summaries = items.map(toItemSummary);
  return {
    ...toItemSummary(item),
    body: item.body,
    backlinks: backlinksOf(item.id, summaries, links).map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
    })),
  };
}

/** Tells the owner's other tabs (any workspace) to refetch their personal space. No content. */
export function publishPersonalChanged(app: FastifyInstance, request: FastifyRequest): void {
  const { user } = requireAuth(request);
  app.realtime.broadcaster.publish({
    to: { userId: user.id, anyWorkspace: true },
    exceptClientId: clientIdOf(request),
    message: { type: 'personal.changed' },
  });
}

/** Deleted items stay restorable this long, then the purge removes them. */
export const PURGE_AFTER_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

/**
 * Removes items deleted more than 30 days before `now`. Links into them turn into links to a note
 * by title (`target_item_id` is set null); their own links go with them.
 */
export async function purgeDeletedPersonalItems(db: DbOrTx, now: Date): Promise<number> {
  const rows = await db
    .delete(personalItems)
    .where(
      and(
        isNotNull(personalItems.deletedAt),
        lt(personalItems.deletedAt, new Date(now.getTime() - PURGE_AFTER_MS)),
      ),
    )
    .returning({ id: personalItems.id });
  return rows.length;
}

/** Daily, in-process (off in tests, which call `purgeDeletedPersonalItems`). */
export function schedulePersonalPurge(app: FastifyInstance): void {
  if (app.config.NODE_ENV === 'test') return;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      const purged = await purgeDeletedPersonalItems(app.db, app.clock());
      if (purged > 0) app.log.info({ purged }, 'Purged deleted personal items');
    } catch (err) {
      app.log.error({ err }, 'Personal purge job failed');
    }
  };
  app.addHook('onReady', () => {
    void run();
    timer = setInterval(() => void run(), DAY_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
