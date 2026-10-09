import {
  activityPayloadSchemas,
  type FeedItem,
  type FeedType,
  type HistoryEntry,
  type TaskActivityType,
  type UserRef,
} from '@kite/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import { activity, users } from '../db/schema/index.js';
import { listComments } from './comments.js';
import { userRefColumns } from './user-ref.js';

const isTaskActivityType = (type: string): type is TaskActivityType =>
  Object.hasOwn(activityPayloadSchemas, type);

type ActivityRow = Pick<typeof activity.$inferSelect, 'id' | 'type' | 'payload' | 'createdAt'>;

/** An activity row as a history line; null (and a warning) when its payload has an unknown shape. */
export function toHistoryEntry(
  row: ActivityRow,
  actor: UserRef,
  log: FastifyBaseLogger,
): HistoryEntry | null {
  const parsed = isTaskActivityType(row.type)
    ? activityPayloadSchemas[row.type].safeParse(row.payload)
    : undefined;
  if (!parsed?.success) {
    log.warn({ activityId: row.id, type: row.type }, 'Skipping activity row with unknown shape');
    return null;
  }
  return {
    kind: 'history',
    id: row.id,
    type: row.type,
    payload: parsed.data,
    actor,
    createdAt: row.createdAt.toISOString(),
  } as HistoryEntry;
}

/** History lines of a task, oldest first. `comment.added` rows are left out: the feed shows the comments themselves. */
async function listHistory(db: Db, taskId: string, log: FastifyBaseLogger) {
  const rows = await db
    .select({ activity, actor: userRefColumns })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.actorId))
    .where(and(eq(activity.taskId, taskId), ne(activity.type, 'comment.added')))
    .orderBy(asc(activity.createdAt), asc(activity.id));

  return rows.flatMap(({ activity: row, actor }) => toHistoryEntry(row, actor, log) ?? []);
}

/**
 * The drawer's activity feed: history lines and comment threads merged oldest first (ties by
 * id, which is time-ordered). `comments` / `history` return only one kind.
 */
export async function buildFeed(
  db: Db,
  taskId: string,
  type: FeedType,
  log: FastifyBaseLogger,
): Promise<FeedItem[]> {
  const [history, threads] = await Promise.all([
    type === 'comments' ? [] : listHistory(db, taskId, log),
    type === 'history' ? [] : listComments(db, taskId),
  ]);
  const items: FeedItem[] = [
    ...history,
    ...threads.map((c) => ({ kind: 'comment' as const, ...c })),
  ];
  return items.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.createdAt < b.createdAt
        ? -1
        : 1,
  );
}
