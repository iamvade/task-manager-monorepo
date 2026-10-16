import {
  formatTaskKey,
  STANDUP_REACTIONS,
  type StandupBlocker,
  type StandupEntry,
  type StandupReactionSummary,
  type StandupReply,
  type StandupTaskRef,
  type UserRef,
  type WorkspaceRole,
} from '@kite/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import type { standupEntries, standupGroups } from '../db/schema/index.js';
import {
  projects,
  standupBlockers,
  standupReactions,
  standupReplies,
  statuses,
  tasks,
  users,
  workspaceMembers,
} from '../db/schema/index.js';

type GroupRow = typeof standupGroups.$inferSelect;
type EntryRow = typeof standupEntries.$inferSelect;
type BlockerRow = typeof standupBlockers.$inferSelect;

export interface StandupViewer {
  userId: string;
  role: WorkspaceRole;
}

/** Who may resolve or reopen a blocker: its author, its helpers, the facilitator, admins/owners. */
export function canResolveBlocker(
  blocker: Pick<BlockerRow, 'helperIds'>,
  authorId: string,
  group: Pick<GroupRow, 'facilitatorId'>,
  viewer: StandupViewer,
): boolean {
  return (
    viewer.userId === authorId ||
    blocker.helperIds.includes(viewer.userId) ||
    group.facilitatorId === viewer.userId ||
    viewer.role !== 'member'
  );
}

/** Linked tasks that still exist in the workspace, by id (deleted ones are left out). */
export async function standupTaskRefs(
  db: DbOrTx,
  workspaceId: string,
  taskIds: Iterable<string>,
): Promise<Map<string, StandupTaskRef>> {
  const ids = [...new Set(taskIds)];
  const refs = new Map<string, StandupTaskRef>();
  if (ids.length === 0) return refs;
  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      category: statuses.category,
      project: { id: projects.id, key: projects.key, name: projects.name, color: projects.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(
      and(inArray(tasks.id, ids), eq(projects.workspaceId, workspaceId), isNull(tasks.deletedAt)),
    );
  for (const r of rows) {
    refs.set(r.id, {
      id: r.id,
      key: formatTaskKey(r.project.key, r.number),
      title: r.title,
      project: r.project,
      statusCategory: r.category,
    });
  }
  return refs;
}

interface Person {
  user: UserRef;
  title: string | null;
}

/** Display refs (and workspace job titles) of `userIds`. */
export async function standupPeople(
  db: DbOrTx,
  workspaceId: string,
  userIds: Iterable<string>,
): Promise<Map<string, Person>> {
  const ids = [...new Set(userIds)];
  const people = new Map<string, Person>();
  if (ids.length === 0) return people;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      initials: users.initials,
      avatarColor: users.avatarColor,
      title: workspaceMembers.title,
    })
    .from(users)
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, users.id), eq(workspaceMembers.workspaceId, workspaceId)),
    )
    .where(inArray(users.id, ids));
  for (const { title, ...user } of rows) people.set(user.id, { user, title });
  return people;
}

interface BlockerSource {
  blocker: BlockerRow;
  entry: Pick<EntryRow, 'id' | 'userId' | 'date'>;
}

interface Refs {
  people: Map<string, Person>;
  tasks: Map<string, StandupTaskRef>;
}

const missingUser = (id: string): UserRef => ({
  id,
  name: '?',
  initials: '?',
  avatarColor: 'neutral',
});
const userOf = (refs: Refs, id: string) => refs.people.get(id)?.user ?? missingUser(id);

type ReplyRow = typeof standupReplies.$inferSelect;

function blockerView(
  { blocker, entry }: BlockerSource,
  refs: Refs,
  group: GroupRow,
  viewer: StandupViewer,
  replies: readonly ReplyRow[],
): StandupBlocker {
  return {
    id: blocker.id,
    entryId: entry.id,
    date: entry.date,
    text: blocker.text,
    author: userOf(refs, entry.userId),
    task: blocker.taskId ? (refs.tasks.get(blocker.taskId) ?? null) : null,
    helpers: blocker.helperIds.flatMap((id) => refs.people.get(id)?.user ?? []),
    resolvedAt: blocker.resolvedAt?.toISOString() ?? null,
    resolvedBy: blocker.resolvedBy ? userOf(refs, blocker.resolvedBy) : null,
    canResolve: canResolveBlocker(blocker, entry.userId, group, viewer),
    createdAt: blocker.createdAt.toISOString(),
    replies: replies.filter((r) => r.blockerId === blocker.id).map((r) => replyView(r, refs)),
  };
}

const replyPeople = (r: ReplyRow) => [r.authorId, ...r.mentionIds];

const blockerPeople = ({ blocker, entry }: BlockerSource) => [
  entry.userId,
  ...blocker.helperIds,
  ...(blocker.resolvedBy ? [blocker.resolvedBy] : []),
];

/** Blocker DTOs, in the order given. */
export async function blockerViews(
  db: DbOrTx,
  group: GroupRow,
  sources: readonly BlockerSource[],
  viewer: StandupViewer,
): Promise<StandupBlocker[]> {
  if (sources.length === 0) return [];
  const replies = await db
    .select()
    .from(standupReplies)
    .where(
      inArray(
        standupReplies.blockerId,
        sources.map((s) => s.blocker.id),
      ),
    )
    .orderBy(asc(standupReplies.createdAt), asc(standupReplies.id));
  const [people, taskRefs] = await Promise.all([
    standupPeople(db, group.workspaceId, [
      ...sources.flatMap(blockerPeople),
      ...replies.flatMap(replyPeople),
    ]),
    standupTaskRefs(
      db,
      group.workspaceId,
      sources.flatMap((s) => (s.blocker.taskId ? [s.blocker.taskId] : [])),
    ),
  ]);
  return sources.map((s) => blockerView(s, { people, tasks: taskRefs }, group, viewer, replies));
}

/** Entry DTOs with their items, blockers, reactions and replies, in the order given. */
export async function entryViews(
  db: DbOrTx,
  group: GroupRow,
  entries: readonly EntryRow[],
  viewer: StandupViewer,
): Promise<StandupEntry[]> {
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);
  const [blockers, reactions, replies] = await Promise.all([
    db
      .select()
      .from(standupBlockers)
      .where(inArray(standupBlockers.entryId, ids))
      .orderBy(asc(standupBlockers.createdAt), asc(standupBlockers.id)),
    db
      .select({
        entryId: standupReactions.entryId,
        userId: standupReactions.userId,
        emoji: standupReactions.emoji,
      })
      .from(standupReactions)
      .where(inArray(standupReactions.entryId, ids))
      .orderBy(asc(standupReactions.createdAt), asc(standupReactions.userId)),
    db
      .select()
      .from(standupReplies)
      .where(inArray(standupReplies.entryId, ids))
      .orderBy(asc(standupReplies.createdAt), asc(standupReplies.id)),
  ]);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const sources: BlockerSource[] = blockers.flatMap((blocker) => {
    const entry = entryById.get(blocker.entryId);
    return entry ? [{ blocker, entry }] : [];
  });

  const taskIds = [
    ...entries.flatMap((e) => [...e.yesterday, ...e.today].flatMap((i) => i.taskId ?? [])),
    ...blockers.flatMap((b) => b.taskId ?? []),
  ];
  const personIds = [
    ...entries.map((e) => e.userId),
    ...sources.flatMap(blockerPeople),
    ...replies.flatMap(replyPeople),
    ...reactions.map((r) => r.userId),
  ];
  const [people, taskRefs] = await Promise.all([
    standupPeople(db, group.workspaceId, personIds),
    standupTaskRefs(db, group.workspaceId, taskIds),
  ]);
  const refs: Refs = { people, tasks: taskRefs };
  const taskOf = (id: string | undefined) => (id ? (taskRefs.get(id) ?? null) : null);

  return entries.map((e): StandupEntry => {
    const mine = reactions.filter((r) => r.entryId === e.id);
    return {
      id: e.id,
      groupId: e.groupId,
      user: userOf(refs, e.userId),
      title: people.get(e.userId)?.title ?? null,
      date: e.date,
      status: e.status,
      postedAt: e.postedAt?.toISOString() ?? null,
      editedAt: e.editedAt?.toISOString() ?? null,
      isLate: e.isLate,
      yesterday: e.yesterday.map((i) => ({ ...i, task: taskOf(i.taskId) })),
      today: e.today.map((i) => ({ ...i, task: taskOf(i.taskId) })),
      blockers: sources
        .filter((s) => s.entry.id === e.id)
        .map((s) => blockerView(s, refs, group, viewer, replies)),
      reactions: STANDUP_REACTIONS.map((emoji) => {
        const of = mine.filter((r) => r.emoji === emoji);
        return {
          emoji,
          count: of.length,
          mine: of.some((r) => r.userId === viewer.userId),
          users: of.map((r) => userOf(refs, r.userId)),
        };
      }),
      replies: replies
        .filter((r) => r.entryId === e.id)
        .map((r): StandupReply => replyView(r, refs)),
    };
  });
}

function replyView(r: ReplyRow, refs: Refs): StandupReply {
  return {
    id: r.id,
    entryId: r.entryId,
    blockerId: r.blockerId,
    author: userOf(refs, r.authorId),
    body: r.body,
    mentions: r.mentionIds.flatMap((id) => refs.people.get(id)?.user ?? []),
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
  };
}

/** One reply's DTO. */
export async function replyDto(
  db: DbOrTx,
  workspaceId: string,
  reply: ReplyRow,
): Promise<StandupReply> {
  const people = await standupPeople(db, workspaceId, [reply.authorId, ...reply.mentionIds]);
  return replyView(reply, { people, tasks: new Map() });
}

/** The reaction pills of one entry for `viewerId`. */
export async function reactionSummary(
  db: DbOrTx,
  workspaceId: string,
  entryId: string,
  viewerId: string,
): Promise<StandupReactionSummary[]> {
  const rows = await db
    .select({ userId: standupReactions.userId, emoji: standupReactions.emoji })
    .from(standupReactions)
    .where(eq(standupReactions.entryId, entryId))
    .orderBy(asc(standupReactions.createdAt), asc(standupReactions.userId));
  const people = await standupPeople(
    db,
    workspaceId,
    rows.map((r) => r.userId),
  );
  const refs: Refs = { people, tasks: new Map() };
  return STANDUP_REACTIONS.map((emoji) => {
    const of = rows.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: of.length,
      mine: of.some((r) => r.userId === viewerId),
      users: of.map((r) => userOf(refs, r.userId)),
    };
  });
}
