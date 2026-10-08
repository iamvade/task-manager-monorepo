import {
  PALETTE_KEYS,
  apiErrorSchema,
  createProjectSchema,
  moveProjectSchema,
  projectDetailSchema,
  updateProjectSchema,
  type PaletteKey,
} from '@kite/shared';
import { and, asc, count, eq, max } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess, requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { isUniqueViolation } from '../db/errors.js';
import { movePosition, positionAfter } from '../db/position.js';
import { one } from '../db/rows.js';
import { favorites, projectMembers, projects, spaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { buildProjectDetail } from '../projects/detail.js';
import { pickProjectKey } from '../projects/keys.js';
import { insertDefaultStatuses } from '../projects/statuses.js';

const err = apiErrorSchema;
const projectParams = z.object({ projectId: z.uuid() });
const KEY_CONSTRAINT = 'projects_workspace_id_key_unique';

/** New projects cycle through these (skipping neutral) unless a color is given. */
const PROJECT_COLORS = PALETTE_KEYS.filter(
  (k): k is Exclude<PaletteKey, 'neutral'> => k !== 'neutral',
);

const keyTaken = () =>
  httpError(409, 'PROJECT_KEY_TAKEN', 'Another project in this workspace uses this key');

/** A space of `workspaceId`; 404 for spaces elsewhere (never confirm they exist). */
async function requireSpaceIn(request: FastifyRequest, workspaceId: string, spaceId: string) {
  const [space] = await request.server.db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.workspaceId, workspaceId)))
    .limit(1);
  if (!space) throw httpError(404, 'NOT_FOUND', 'Space not found');
  return space;
}

export const projectRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const detail = (request: FastifyRequest, project: typeof projects.$inferSelect) =>
    buildProjectDetail(app.db, project, requireAuth(request).user);

  app.post(
    '/workspaces/:workspaceId/projects',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Create a project',
        description:
          'Without `key` a unique one is generated from the name; a taken key answers 409 `PROJECT_KEY_TAKEN`. Creates the four default statuses and adds the creator to the project team.',
        params: z.object({ workspaceId: z.uuid() }),
        body: createProjectSchema,
        response: { 201: projectDetailSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { user } = requireAuth(request);
      const { spaceId, name, key, color } = request.body;
      await requireSpaceIn(request, workspaceId, spaceId);

      const create = () =>
        app.db.transaction(async (tx) => {
          const [last] = await tx
            .select({ position: max(projects.position) })
            .from(projects)
            .where(eq(projects.spaceId, spaceId));
          const [existing] = await tx
            .select({ n: count() })
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId));
          const values = {
            workspaceId,
            spaceId,
            name,
            key: key ?? (await pickProjectKey(tx, workspaceId, name)),
            color: color ?? PROJECT_COLORS[(existing?.n ?? 0) % PROJECT_COLORS.length] ?? 'violet',
            position: positionAfter(last?.position),
          };
          const project = one(await tx.insert(projects).values(values).returning(), 'project');
          await insertDefaultStatuses(tx, project.id);
          await tx.insert(projectMembers).values({ projectId: project.id, userId: user.id });
          return project;
        });

      // A generated key can lose a race with a concurrent create; pick again.
      let project: typeof projects.$inferSelect | undefined;
      for (let attempt = 1; !project; attempt++) {
        try {
          project = await create();
        } catch (e) {
          if (!isUniqueViolation(e, KEY_CONSTRAINT)) throw e;
          if (key || attempt >= 3) throw keyTaken();
        }
      }
      return reply.code(201).send(await detail(request, project));
    },
  );

  app.get(
    '/projects/:projectId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Get a project',
        description:
          "Statuses, team, active sprint (in the caller's time zone) and task counts per status.",
        params: projectParams,
        response: { 200: projectDetailSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      return detail(request, project);
    },
  );

  app.patch(
    '/projects/:projectId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Update a project',
        description: 'Name, key or color. 409 `PROJECT_KEY_TAKEN` when the key is in use.',
        params: projectParams,
        body: updateProjectSchema,
        response: { 200: projectDetailSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      try {
        const [updated] = await app.db
          .update(projects)
          .set(request.body)
          .where(eq(projects.id, project.id))
          .returning();
        return await detail(request, updated ?? project);
      } catch (e) {
        if (isUniqueViolation(e, KEY_CONSTRAINT)) throw keyTaken();
        throw e;
      }
    },
  );

  app.post(
    '/projects/:projectId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Reorder or move a project',
        description:
          'Neighbors after the move (`prevId`, `nextId`), optionally into another space of the same workspace (`spaceId`).',
        params: projectParams,
        body: moveProjectSchema,
        response: { 200: projectDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { project, workspaceId } = await loadProjectAccess(request, request.params.projectId);
      const { spaceId = project.spaceId, ...move } = request.body;
      if (spaceId !== project.spaceId) await requireSpaceIn(request, workspaceId, spaceId);
      const siblings = await app.db
        .select({ id: projects.id, position: projects.position })
        .from(projects)
        .where(eq(projects.spaceId, spaceId))
        .orderBy(asc(projects.position));
      const position = movePosition(siblings, project.id, move);
      const [updated] = await app.db
        .update(projects)
        .set({ spaceId, position })
        .where(eq(projects.id, project.id))
        .returning();
      return detail(request, updated ?? project);
    },
  );

  for (const action of ['archive', 'unarchive'] as const) {
    app.post(
      `/projects/:projectId/${action}`,
      {
        preHandler: app.authenticate,
        schema: {
          tags: ['Projects'],
          summary: action === 'archive' ? 'Archive a project' : 'Restore an archived project',
          description: 'Admin or owner. Archived projects leave the sidebar but stay readable.',
          params: projectParams,
          response: { 200: projectDetailSchema, 401: err, 403: err, 404: err },
        },
      },
      async (request) => {
        const { project } = await loadProjectAccess(request, request.params.projectId, 'admin');
        const archivedAt = action === 'archive' ? (project.archivedAt ?? new Date()) : null;
        const [updated] = await app.db
          .update(projects)
          .set({ archivedAt })
          .where(eq(projects.id, project.id))
          .returning();
        return detail(request, updated ?? project);
      },
    );
  }

  app.put(
    '/projects/:projectId/favorite',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Add to favorites',
        description: 'Idempotent.',
        params: projectParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const { user } = requireAuth(request);
      await app.db
        .insert(favorites)
        .values({ userId: user.id, projectId: project.id })
        .onConflictDoNothing();
      return reply.code(204).send(null);
    },
  );

  app.delete(
    '/projects/:projectId/favorite',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Projects'],
        summary: 'Remove from favorites',
        description: 'Idempotent.',
        params: projectParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const { user } = requireAuth(request);
      await app.db
        .delete(favorites)
        .where(and(eq(favorites.userId, user.id), eq(favorites.projectId, project.id)));
      return reply.code(204).send(null);
    },
  );
  done();
};
