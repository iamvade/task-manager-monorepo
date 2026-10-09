import {
  apiErrorSchema,
  formatTaskKey,
  parseTaskKey,
  searchQuerySchema,
  searchResultSchema,
  type SearchResult,
} from '@kite/shared';
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { projects, statuses, tasks, users, workspaceMembers } from '../db/schema/index.js';
import { userRefColumns } from '../tasks/user-ref.js';
import { escapeLike } from '../tasks/list.js';

const err = apiErrorSchema;
const LIMIT = 20;
const GROUP_LIMIT = 5;
/** `APP-14`: a key and the start of a number. */
const PARTIAL_KEY = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{0,9})$/;

export const searchRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/search',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Search'],
        summary: 'Search the workspace (⌘K)',
        description:
          'Up to 20 results in all: at most 5 projects (name or key) and 5 people (name or email), tasks fill the rest. Tasks match by key (`APP-142`, or a prefix like `APP-14`) or title (substring or similar words); the exact key first, then title prefixes, then by similarity. Archived projects and deleted tasks are left out.',
        params: z.object({ workspaceId: z.uuid() }),
        querystring: searchQuerySchema,
        response: { 200: searchResultSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request): Promise<SearchResult> => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { q } = request.query;
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

      const [projectRows, people, taskRows] = await Promise.all([
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
        db
          .select(userRefColumns)
          .from(workspaceMembers)
          .innerJoin(users, eq(users.id, workspaceMembers.userId))
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              or(ilike(users.name, contains), ilike(users.email, prefix)),
            ),
          )
          .orderBy(asc(users.name))
          .limit(GROUP_LIMIT),
        db
          .select({
            id: tasks.id,
            number: tasks.number,
            title: tasks.title,
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
              or(keyMatch, ilike(tasks.title, contains), sql`${q} <% ${tasks.title}`),
            ),
          )
          .orderBy(
            ...exactKeyFirst,
            desc(sql`${tasks.title} ilike ${prefix}`),
            desc(sql`word_similarity(${q}, ${tasks.title})`),
            desc(tasks.updatedAt),
            asc(tasks.id),
          )
          .limit(LIMIT),
      ]);

      return {
        projects: projectRows.map((p) => ({
          id: p.id,
          workspaceId: p.workspaceId,
          spaceId: p.spaceId,
          key: p.key,
          name: p.name,
          color: p.color,
          archivedAt: null,
        })),
        people,
        tasks: taskRows
          .slice(0, LIMIT - projectRows.length - people.length)
          .map(({ number, ...t }) => ({ ...t, key: formatTaskKey(t.project.key, number) })),
      };
    },
  );
  done();
};
