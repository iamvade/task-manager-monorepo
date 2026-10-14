import {
  apiErrorSchema,
  formatTaskKey,
  matchesName,
  parseTaskKey,
  searchQuerySchema,
  searchResultSchema,
  type SearchResult,
} from '@kite/shared';
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import {
  comments,
  projects,
  statuses,
  tasks,
  users,
  workspaceMembers,
} from '../db/schema/index.js';
import { userRefColumns } from '../tasks/user-ref.js';
import { assigneesSql, escapeLike } from '../tasks/list.js';
import { activeMember } from '../auth/membership.js';

const err = apiErrorSchema;
const LIMIT = 20;
const GROUP_LIMIT = 5;
/** `APP-14`: a key and the start of a number. */
const PARTIAL_KEY = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{0,9})$/;

/** ~120 characters of `text` around the first (case-insensitive) occurrence of `q`. */
export function snippetAround(text: string, q: string, radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(q.trim().toLowerCase());
  if (at < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + q.trim().length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

export const searchRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/search',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Search'],
        summary: 'Search the workspace (⌘K)',
        description:
          'Up to 20 results in all: at most 5 projects (name or key) and 5 people (name in either script — "Bat" finds Бат-Эрдэнэ — or email prefix), tasks fill the rest, plus up to 5 comments containing the text. Tasks (with status, assignees and due date, so look-alike titles can be told apart) match by key (`APP-142`, or a prefix like `APP-14`), title (substring or similar words) or description text; the exact key first, then title prefixes, then by similarity, description-only matches last. `nextTaskOffset` pages through more tasks (`offset`, tasks only). Archived projects, deleted tasks and deleted comments are left out.',
        params: z.object({ workspaceId: z.uuid() }),
        querystring: searchQuerySchema,
        response: { 200: searchResultSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request): Promise<SearchResult> => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { q, offset } = request.query;
      const more = offset > 0;
      const contains = `%${escapeLike(q)}%`;
      const prefix = `${escapeLike(q)}%`;
      const db = app.db;

      const exact = parseTaskKey(q);
      const partial = PARTIAL_KEY.exec(q);
      const keyMatch: SQL | undefined = partial?.[1]
        ? and(
            eq(projects.key, partial[1].toUpperCase()),
            partial[2] ? sql`${tasks.number}::text like ${`${partial[2]}%`}` : undefined,
          )
        : undefined;
      const exactKeyFirst = exact
        ? [desc(sql`(${projects.key} = ${exact.key} and ${tasks.number} = ${exact.number})`)]
        : [];

      const [projectRows, memberRows, taskRows, commentRows] = await Promise.all([
        db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              isNull(projects.archivedAt),
              or(ilike(projects.name, contains), ilike(projects.key, prefix)),
            ),
          )
          .orderBy(desc(sql`${projects.key} = upper(${q})`), asc(projects.name))
          .limit(GROUP_LIMIT),
        // Every member, matched in JS so Latin and Cyrillic spellings find each other
        // (`matchesName`); a workspace has at most a few hundred people.
        db
          .select({ ...userRefColumns, email: users.email })
          .from(workspaceMembers)
          .innerJoin(users, eq(users.id, workspaceMembers.userId))
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), activeMember))
          .orderBy(asc(users.name)),
        db
          .select({
            id: tasks.id,
            number: tasks.number,
            title: tasks.title,
            dueDate: tasks.dueDate,
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
          })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .innerJoin(statuses, eq(statuses.id, tasks.statusId))
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              isNull(projects.archivedAt),
              isNull(tasks.deletedAt),
              or(
                keyMatch,
                ilike(tasks.title, contains),
                sql`${q} <% ${tasks.title}`,
                ilike(tasks.descriptionText, contains),
              ),
            ),
          )
          .orderBy(
            ...exactKeyFirst,
            desc(sql`${tasks.title} ilike ${prefix}`),
            // Title matches before description-only ones.
            desc(sql`${tasks.title} ilike ${contains} or ${q} <% ${tasks.title}`),
            desc(sql`word_similarity(${q}, ${tasks.title})`),
            desc(tasks.updatedAt),
            asc(tasks.id),
          )
          .offset(offset)
          .limit(LIMIT + 1),
        more
          ? Promise.resolve([])
          : db
              .select({
                id: comments.id,
                bodyText: comments.bodyText,
                createdAt: comments.createdAt,
                author: userRefColumns,
                task: { id: tasks.id, number: tasks.number, title: tasks.title },
                projectKey: projects.key,
                status: {
                  id: statuses.id,
                  name: statuses.name,
                  category: statuses.category,
                  color: statuses.color,
                },
              })
              .from(comments)
              .innerJoin(tasks, eq(tasks.id, comments.taskId))
              .innerJoin(projects, eq(projects.id, tasks.projectId))
              .innerJoin(statuses, eq(statuses.id, tasks.statusId))
              .innerJoin(users, eq(users.id, comments.authorId))
              .where(
                and(
                  eq(projects.workspaceId, workspaceId),
                  isNull(projects.archivedAt),
                  isNull(tasks.deletedAt),
                  isNull(comments.deletedAt),
                  ilike(comments.bodyText, contains),
                ),
              )
              .orderBy(desc(comments.createdAt), desc(comments.id))
              .limit(GROUP_LIMIT),
      ]);

      const emailPrefix = q.trim().toLowerCase();
      const people = (more ? [] : memberRows)
        .filter((m) => matchesName(m.name, q) || m.email.toLowerCase().startsWith(emailPrefix))
        .slice(0, GROUP_LIMIT)
        .map(({ email: _email, ...user }) => user);

      const shownProjects = more ? [] : projectRows;
      // The first page shares 20 slots with projects and people; later pages are 20 tasks.
      const room = more ? LIMIT : LIMIT - shownProjects.length - people.length;
      const pageTasks = taskRows.slice(0, room);
      return {
        nextTaskOffset: taskRows.length > room ? offset + room : null,
        comments: commentRows.map((c) => ({
          id: c.id,
          task: {
            id: c.task.id,
            key: formatTaskKey(c.projectKey, c.task.number),
            title: c.task.title,
            status: c.status,
          },
          author: c.author,
          snippet: snippetAround(c.bodyText, q),
          createdAt: c.createdAt.toISOString(),
        })),
        projects: shownProjects.map((p) => ({
          id: p.id,
          workspaceId: p.workspaceId,
          spaceId: p.spaceId,
          key: p.key,
          name: p.name,
          color: p.color,
          archivedAt: null,
          createdById: p.createdBy,
        })),
        people,
        tasks: pageTasks.map(({ number, ...t }) => ({
          ...t,
          key: formatTaskKey(t.project.key, number),
        })),
      };
    },
  );
  done();
};
