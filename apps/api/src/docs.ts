import swagger, { type SwaggerTransformObject } from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import { SESSION_COOKIE } from './auth/sessions.js';

export const DOCS_PREFIX = '/api/docs';

const description = `
REST API for Kite Tasks. All endpoints live under \`/api/v1\` and speak JSON.

**Auth.** Sign in with \`POST /auth/login\`; the session is the httpOnly \`${SESSION_COOKIE}\` cookie
(30-day sliding expiry). Open these docs through the web dev server
(\`http://localhost:5173/api/docs\`) so the cookie and requests share the web origin.

**CSRF.** Every POST/PUT/PATCH/DELETE must carry \`Origin\` equal to the web origin, otherwise
403 \`CSRF_REJECTED\`.

**Errors.** Always \`{ "error": { "code", "message" } }\` with a matching HTTP status. A resource in
a workspace you are not a member of answers **404** (its existence is never confirmed); 403 means
you are a member without the required role.
`.trim();

const tags = [
  { name: 'Health', description: 'Liveness and database check' },
  { name: 'Auth', description: 'Sessions: login, logout, current user' },
  { name: 'Me', description: 'Profile and preferences of the signed-in user' },
  { name: 'Invites', description: 'Workspace invitations' },
  { name: 'Workspaces', description: 'Sidebar, members and project key suggestions' },
  { name: 'Spaces', description: 'Groups of projects inside a workspace' },
  { name: 'Projects', description: 'Projects, archive and favorites' },
  { name: 'Project members', description: "A project's team (not an access boundary)" },
  { name: 'Tags', description: 'Workspace tags' },
  { name: 'Statuses', description: 'Workflow statuses of a project' },
  { name: 'Sprints', description: 'Project sprints' },
  { name: 'Templates', description: 'Fill an empty project from a template' },
];

const REF = /"#\/components\/schemas\/([^"]+)"/g;

/**
 * The zod transform emits every registered schema twice (`X` for responses, `XInput` for
 * bodies). Keep only the components the paths actually reference, directly or transitively.
 */
const pruneUnusedSchemas: SwaggerTransformObject = (input) => {
  const doc = jsonSchemaTransformObject(input);
  if (!('components' in doc) || !doc.components?.schemas) return doc;
  const all = doc.components.schemas;
  const used = new Set<string>();
  const queue = [JSON.stringify(doc.paths ?? {})];
  for (let json = queue.pop(); json !== undefined; json = queue.pop()) {
    for (const [, name] of json.matchAll(REF)) {
      if (!name || used.has(name)) continue;
      used.add(name);
      queue.push(JSON.stringify(name in all ? all[name] : {}));
    }
  }
  for (const name of Object.keys(all)) {
    if (!used.has(name)) Reflect.deleteProperty(all, name);
  }
  return doc;
};

/**
 * OpenAPI spec (generated from the routes' zod schemas) at `/api/docs/json` and Swagger UI at
 * `/api/docs`. Register before the routes: the spec is collected from `onRoute`.
 */
export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Kite Tasks API', version: '1', description },
      tags,
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
        },
      },
      security: [{ cookieAuth: [] }],
    },
    transform: jsonSchemaTransform,
    transformObject: pruneUnusedSchemas,
  });

  await app.register(swaggerUi, {
    routePrefix: DOCS_PREFIX,
    // Serves its own CSP for the UI pages, so it works alongside @fastify/helmet.
    staticCSP: true,
    // Over plain http (local dev) upgrade-insecure-requests makes some browsers (Safari) fetch the
    // UI's scripts over https, which fails.
    transformStaticCSP: (header) =>
      app.config.NODE_ENV === 'production'
        ? header
        : header.replace(/\s*upgrade-insecure-requests;?/, ''),
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      persistAuthorization: true,
      withCredentials: true,
    },
  });
}
