/**
 * What every tool file shares: argument schemas, the read/write annotations, the result wrapper
 * that turns failures into messages Claude can act on, and the lookups several tools need.
 */
import { taskDetailSchema, todayInZone, type TaskDetail, type UserRef } from '@kite/shared';
import { NetworkError, isApiError, toQuery } from '@kite/shared/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Kite, Workspace } from './kite.js';
import { ToolError, matchMember, taskKey } from './resolve.js';

/** Today in the person's zone; an unknown zone falls back to Kite's default. */
export function todayIn(timeZone: string): string {
  try {
    return todayInZone(timeZone);
  } catch {
    return todayInZone('Asia/Ulaanbaatar');
  }
}

export const workspaceArg = z
  .string()
  .optional()
  .describe('Workspace slug; only needed when you are in several (see list_workspaces).');
export const keyArg = z.string().describe('Task key, e.g. APP-142.');
export const dateArg = z
  .string()
  .nullable()
  .describe('YYYY-MM-DD in your time zone; null clears it.');

export const READ = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** Text result, or a tool error Claude can read and fix. */
const text = (body: string): CallToolResult => ({ content: [{ type: 'text', text: body }] });

/** API error codes that deserve a plainer sentence than "Kite said 409 CODE". */
const CODE_MESSAGES: Record<string, string> = {
  NOT_STANDUP_DAY: 'The group has no standup today, so nothing can be posted.',
  STANDUP_DAY_CLOSED: 'That standup day is over; updates can only be written on their own day.',
  GROUP_ARCHIVED: 'This standup group is archived.',
  ALREADY_POSTED: 'This update is already posted; a posted update cannot go back to a draft.',
  INVALID_HELPER: 'Helpers must be other members of the standup group.',
  INVALID_TASK: 'A linked task is not a task of this workspace.',
};

/** What the person should do about a failure: it differs between the two ways of running. */
interface Hints {
  unauthorized: string;
  outdated: string;
  unreachable: string;
}

const DESKTOP_HINTS: Hints = {
  unauthorized:
    'Kite rejected the token (revoked or expired). Create a new one in Kite: Settings → Claude, then update KITE_TOKEN and restart Claude Desktop.',
  outdated:
    'Kite answered in a format this server does not understand: the Kite server is probably newer than this kite-mcp build. Rebuild it (pnpm --filter @kite/mcp build) and restart Claude Desktop.',
  unreachable: 'Could not reach Kite at KITE_URL',
};

/** The remote connector: nothing is installed or configured on the person's side. */
const CONNECTOR_HINTS: Hints = {
  unauthorized:
    'Kite no longer accepts this sign-in (disconnected or expired). Reconnect Kite in Claude: Customize → Connectors.',
  outdated:
    'Kite answered in a format this connector does not understand. Its administrator needs to update the Kite connector.',
  unreachable: 'The connector could not reach Kite',
};

let hints = DESKTOP_HINTS;

/** Set once at start-up by the HTTP entry point; the stdio server keeps the desktop wording. */
export function useConnectorHints(): void {
  hints = CONNECTOR_HINTS;
}

/** Explains failures in words Claude can act on; never includes the token. */
export function errorResult(err: unknown): CallToolResult {
  let message: string;
  if (err instanceof ToolError) message = err.message;
  else if (isApiError(err)) {
    const known = CODE_MESSAGES[err.code];
    if (err.status === 401) {
      message = hints.unauthorized;
    } else if (known) message = known;
    else if (err.status === 404) message = `Not found in Kite (${err.message}).`;
    else message = `Kite said ${err.status} ${err.code}: ${err.message}`;
  } else if (err instanceof Error && err.name === 'ZodError') {
    message = hints.outdated;
  } else if (err instanceof NetworkError) {
    message = `${hints.unreachable} (${err.message}). Is the server running?`;
  } else {
    message = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export const run =
  <A>(fn: (args: A) => Promise<string>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return text(await fn(args));
    } catch (err) {
      return errorResult(err);
    }
  };

export interface Lookups {
  /** The task with this key in the workspace (keys repeat across workspaces). */
  task: (workspace: Workspace, key: string) => Promise<TaskDetail>;
  /** Workspace members named by "me", a name or an email, in the order given. */
  people: (workspace: Workspace, people: readonly string[]) => Promise<UserRef[]>;
}

export function createLookups(kite: Kite): Lookups {
  return {
    task: (workspace, key) =>
      kite.api.apiFetch(
        `/tasks/${encodeURIComponent(taskKey(key))}${toQuery({ workspaceId: workspace.id })}`,
        taskDetailSchema,
      ),
    people: async (workspace, people) => {
      const [members, me] = await Promise.all([kite.members(workspace.id), kite.me()]);
      return people.map((p) => matchMember(members, p, me.user.id).user);
    },
  };
}
