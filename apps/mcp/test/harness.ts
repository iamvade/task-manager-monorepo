/** The in-memory MCP client over a fake Kite API that every tool test uses. */
import {
  ME,
  PROJECT_ID,
  SIDEBAR,
  STATUSES,
  WORKSPACE_ID,
  at,
  makeTask,
} from '@kite/shared/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach } from 'vitest';
import { Kite } from '../src/kite.js';
import { createServer } from '../src/server.js';

export const TOKEN = 'b'.repeat(43);

export const MEMBERS = [
  { id: ME.user.id, name: ME.user.name, email: ME.user.email },
  { id: '01890000-0000-7000-8000-0000000000b1', name: 'Bat Ochir', email: 'bat@kite.test' },
].map((u) => ({
  user: { ...u, initials: 'X', avatarColor: 'blue' },
  role: 'member',
  title: null,
  capacityPoints: 15,
  joinedAt: '2026-01-01T00:00:00.000Z',
  absences: [],
  deactivatedAt: null,
}));
export const BAT = at(MEMBERS, 1).user;

export interface Call {
  method: string;
  path: string;
  /** The query string, with its `?` (empty when none). */
  query: string;
  body: unknown;
  auth: string | null;
}

/** A fake Kite API: answers by `METHOD path` (query string ignored) and records every call. */
export function fakeKite(routes: Record<string, (body: unknown) => unknown>) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({
      method,
      path,
      query: url.search,
      body,
      auth: new Headers(init?.headers).get('authorization'),
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return Promise.resolve(
        Response.json(
          { error: { code: 'NOT_FOUND', message: `${method} ${path}` } },
          { status: 404 },
        ),
      );
    }
    const result = handler(body);
    return Promise.resolve(result instanceof Response ? result : Response.json(result));
  };
  return { calls, fetchImpl };
}

export const TASK = makeTask('Fix login', 'todo');
export const DETAIL = {
  ...TASK,
  description: null,
  descriptionText: '',
  sprint: null,
  reviewer: null,
  creator: ME.user,
  subtasks: [],
  attachments: [],
  followers: [],
  deletedAt: null,
  mentionedIn: [],
  linkedFeedback: [],
};

export const comment = (bodyText: string) => ({
  id: '01890000-0000-7000-8000-0000000000c1',
  taskId: TASK.id,
  parentId: null,
  author: ME.user,
  body: bodyText ? { type: 'doc' } : null,
  bodyText,
  createdAt: '2026-11-11T00:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  replies: [],
});

export const BASE_ROUTES = {
  'GET /auth/me': () => ME,
  [`GET /workspaces/${WORKSPACE_ID}/sidebar`]: () => SIDEBAR,
  [`GET /workspaces/${WORKSPACE_ID}/members`]: () => MEMBERS,
  [`GET /projects/${PROJECT_ID}/statuses`]: () => STATUSES,
  [`GET /tasks/${TASK.key}`]: () => DETAIL,
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});

export async function connect(
  routes: Record<string, (body: unknown) => unknown>,
  env: { workspace?: string } = {},
) {
  const api = fakeKite({ ...BASE_ROUTES, ...routes });
  const kite = new Kite(
    { baseUrl: 'http://kite.test', token: TOKEN, workspace: env.workspace },
    { fetch: api.fetchImpl },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(kite);
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  close = async () => {
    await client.close();
    await server.close();
  };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { type: string; text: string }[];
    return { isError: res.isError === true, text: content.map((c) => c.text).join('\n') };
  };
  return { call, calls: api.calls, client };
}

export const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET');
