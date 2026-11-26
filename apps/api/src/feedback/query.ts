import {
  FEEDBACK_NO_TOPIC,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  feedbackActivityDataSchema,
  formatFeedbackRef,
  formatTaskKey,
  parseFeedbackRef,
  type FeedbackDetail,
  type FeedbackListItem,
  type FeedbackListQuery,
  type FeedbackListResponse,
  type FeedbackReportRef,
  type FeedbackTaskRef,
  type FeedbackTopic,
} from '@kite/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import {
  feedback,
  feedbackActivity,
  feedbackAttachments,
  feedbackTopics,
  projects,
  statuses,
  tasks,
  users,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { assigneesSql, escapeLike } from '../tasks/list.js';
import { userRefColumns } from '../tasks/user-ref.js';

type FeedbackRow = typeof feedback.$inferSelect;

/** Columns of a task as `FeedbackTaskRef` (select from tasks ⋈ projects ⋈ statuses). */
export const taskRefColumns = {
  id: tasks.id,
  number: tasks.number,
  title: tasks.title,
  dueDate: tasks.dueDate,
  completedAt: tasks.completedAt,
  assignees: assigneesSql,
  project: {
    id: projects.id,
    spaceId: projects.spaceId,
    key: projects.key,
    name: projects.name,
    color: projects.color,
  },
  status: {
    id: statuses.id,
    name: statuses.name,
    category: statuses.category,
    color: statuses.color,
  },
};

interface TaskRefRow {
  id: string;
  number: number;
  title: string;
  dueDate: string | null;
  completedAt: Date | null;
  assignees: FeedbackTaskRef['assignees'];
  project: FeedbackTaskRef['project'];
  status: FeedbackTaskRef['status'];
}

export const toTaskRef = (row: TaskRefRow): FeedbackTaskRef => ({
  id: row.id,
  key: formatTaskKey(row.project.key, row.number),
  title: row.title,
  dueDate: row.dueDate,
  completedAt: row.completedAt?.toISOString() ?? null,
  assignees: row.assignees,
  project: row.project,
  status: row.status,
});

/** Live tasks by id, as `FeedbackTaskRef`. */
export async function taskRefs(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, FeedbackTaskRef>();
  const rows = await db
    .select(taskRefColumns)
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(and(inArray(tasks.id, [...ids]), isNull(tasks.deletedAt)));
  return new Map(rows.map((r) => [r.id, toTaskRef(r)]));
}

type TopicRow = typeof feedbackTopics.$inferSelect;
export const toTopic = (t: TopicRow): FeedbackTopic => ({
  id: t.id,
  key: t.key,
  name: t.name,
  color: t.color,
});

/** Topics by id, as `FeedbackTopic`. */
export async function topicsById(db: DbOrTx, ids: readonly (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map<string, FeedbackTopic>();
  const rows = await db.select().from(feedbackTopics).where(inArray(feedbackTopics.id, wanted));
  return new Map(rows.map((t) => [t.id, toTopic(t)]));
}

/** `topic` filter: a key of this workspace's topics, or `none`. */
function topicFilter(workspaceId: string, topic: string | undefined): SQL | undefined {
  if (!topic) return undefined;
  if (topic === FEEDBACK_NO_TOPIC) return isNull(feedback.topicId);
  return inArray(feedback.topicId, sqlTopicIds(workspaceId, topic));
}
const sqlTopicIds = (workspaceId: string, key: string) =>
  sql`(select ft.id from feedback_topics ft where ft.workspace_id = ${workspaceId} and ft.key = ${key})`;

const attachmentCountSql = sql<number>`(
  select count(*)::int from feedback_attachments fa where fa.feedback_id = ${feedback.id})`;

/** Title, body, submitter name or email contain `q`; or `q` is this item's ref. */
function searchFilter(q: string | undefined): SQL | undefined {
  if (!q) return undefined;
  const contains = `%${escapeLike(q)}%`;
  const ref = parseFeedbackRef(q);
  return or(
    ilike(feedback.title, contains),
    ilike(feedback.body, contains),
    ilike(feedback.submitterName, contains),
    ilike(feedback.email, contains),
    ref !== null ? eq(feedback.number, ref) : undefined,
  );
}

export const toReportRef = (row: FeedbackRow): FeedbackReportRef => ({
  id: row.id,
  ref: formatFeedbackRef(row.number),
  type: row.type,
  status: row.status,
  title: row.title,
  submitterName: row.submitterName,
  email: row.email,
  createdAt: row.createdAt.toISOString(),
});

/** `GET /workspaces/:id/feedback`: one page plus the counts of the tabs and chips. */
export async function listFeedback(
  db: DbOrTx,
  workspaceId: string,
  query: FeedbackListQuery,
): Promise<FeedbackListResponse> {
  // The topic filter narrows everything, like the search (tabs and chips count inside it).
  const inWorkspace = and(
    eq(feedback.workspaceId, workspaceId),
    topicFilter(workspaceId, query.topic),
  );
  const search = searchFilter(query.q);
  const ofType = query.type ? eq(feedback.type, query.type) : undefined;
  const ofStatus =
    query.status && query.status.length > 0 ? inArray(feedback.status, query.status) : undefined;
  const where = and(inWorkspace, search, ofType, ofStatus);

  const [rows, [totals], byType, byStatus] = await Promise.all([
    db
      .select({ row: feedback, attachmentCount: attachmentCountSql })
      .from(feedback)
      .where(where)
      .orderBy(desc(feedback.createdAt), desc(feedback.id))
      .offset(query.offset)
      .limit(query.limit),
    db
      .select({
        total: count(),
        unread: sql<number>`count(*) filter (where not ${feedback.isRead})::int`,
      })
      .from(feedback)
      .where(where),
    db
      .select({ type: feedback.type, n: count() })
      .from(feedback)
      .where(and(inWorkspace, search))
      .groupBy(feedback.type),
    db
      .select({ status: feedback.status, n: count() })
      .from(feedback)
      .where(and(inWorkspace, search, ofType))
      .groupBy(feedback.status),
  ]);

  const [linked, topics] = await Promise.all([
    taskRefs(
      db,
      rows.flatMap((r) => (r.row.taskId ? [r.row.taskId] : [])),
    ),
    topicsById(
      db,
      rows.map((r) => r.row.topicId),
    ),
  ]);
  const typeCounts = Object.fromEntries([
    ['all', byType.reduce((sum, r) => sum + r.n, 0)],
    ...FEEDBACK_TYPES.map((t) => [t, byType.find((r) => r.type === t)?.n ?? 0]),
  ]) as FeedbackListResponse['typeCounts'];
  const statusCounts = Object.fromEntries(
    FEEDBACK_STATUSES.map((s) => [s, byStatus.find((r) => r.status === s)?.n ?? 0]),
  ) as FeedbackListResponse['statusCounts'];

  return {
    items: rows.map(({ row, attachmentCount }) => toListItem(row, attachmentCount, linked, topics)),
    total: totals?.total ?? 0,
    unread: totals?.unread ?? 0,
    typeCounts,
    statusCounts,
  };
}

const toListItem = (
  row: FeedbackRow,
  attachmentCount: number,
  linked: Map<string, FeedbackTaskRef>,
  topics: Map<string, FeedbackTopic>,
): FeedbackListItem => ({
  id: row.id,
  ref: formatFeedbackRef(row.number),
  type: row.type,
  status: row.status,
  title: row.title,
  preview: row.body.replace(/\s+/g, ' ').trim().slice(0, 160),
  attachmentCount,
  submitterName: row.submitterName,
  email: row.email,
  topic: row.topicId ? (topics.get(row.topicId) ?? null) : null,
  task: row.taskId ? (linked.get(row.taskId) ?? null) : null,
  isRead: row.isRead,
  createdAt: row.createdAt.toISOString(),
});

export async function loadFeedbackRow(db: DbOrTx, id: string): Promise<FeedbackRow> {
  const [row] = await db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Feedback not found');
  return row;
}

/** Feedback linked to a task, oldest first (the duplicates list; the first is the original). */
export async function reportsOfTask(db: DbOrTx, taskId: string): Promise<FeedbackReportRef[]> {
  const rows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.taskId, taskId))
    .orderBy(asc(feedback.createdAt), asc(feedback.id));
  return rows.map(toReportRef);
}

/** `GET /feedback/:id`. */
export async function buildFeedbackDetail(db: DbOrTx, id: string): Promise<FeedbackDetail> {
  const row = await loadFeedbackRow(db, id);
  const [files, log, linked, reports, topics] = await Promise.all([
    db
      .select()
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.feedbackId, id))
      .orderBy(asc(feedbackAttachments.createdAt), asc(feedbackAttachments.id)),
    db
      .select({ row: feedbackActivity, actor: userRefColumns })
      .from(feedbackActivity)
      .leftJoin(users, eq(users.id, feedbackActivity.actorId))
      .where(eq(feedbackActivity.feedbackId, id))
      .orderBy(asc(feedbackActivity.createdAt), asc(feedbackActivity.id)),
    taskRefs(db, row.taskId ? [row.taskId] : []),
    row.taskId ? reportsOfTask(db, row.taskId) : Promise.resolve([]),
    topicsById(db, [row.topicId]),
  ]);
  const { preview: _preview, ...item } = toListItem(row, files.length, linked, topics);
  return {
    ...item,
    body: row.body,
    phone: row.phone,
    device: row.device,
    userAgent: row.userAgent,
    attachments: files.map((f) => ({
      id: f.id,
      filename: f.filename,
      mime: f.mime,
      size: f.size,
      createdAt: f.createdAt.toISOString(),
    })),
    linkedReports: reports,
    notifyOnDone: row.notifyOnDone,
    activity: log.map(({ row: a, actor }) => {
      const data = feedbackActivityDataSchema.safeParse(a.data);
      return {
        id: a.id,
        kind: a.kind,
        // A left join gives an object of nulls when the actor is gone or there is none.
        actor: actor?.id ? actor : null,
        text: a.text,
        data: data.success ? data.data : {},
        createdAt: a.createdAt.toISOString(),
      };
    }),
    updatedAt: row.updatedAt.toISOString(),
  };
}
