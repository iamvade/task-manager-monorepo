/**
 * The tools Claude gets. A curated set, not one tool per endpoint: reads, and the everyday
 * writes (create, update, comment, complete). Nothing deletes, archives or changes settings —
 * the token itself could, so this list is the only thing keeping Claude to these actions.
 */
import {
  PRIORITIES,
  commentSchema,
  homeSchema,
  notificationPageSchema,
  plainToRichText,
  shortName,
  searchResultSchema,
  taskDetailSchema,
  taskListItemSchema,
  type RichTextNode,
  type TaskDetail,
} from '@kite/shared';
import { NetworkError, isApiError, toQuery } from '@kite/shared/client';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { names, section, taskLine, userContent } from './format.js';
import type { Kite, Workspace } from './kite.js';
import { ToolError, matchMember, matchStatus, parseDate, statusLabel, taskKey } from './resolve.js';

const LIST_LIMIT = 100;

const workspaceArg = z
  .string()
  .optional()
  .describe('Workspace slug; only needed when you are in several (see list_workspaces).');
const keyArg = z.string().describe('Task key, e.g. APP-142.');
const priorityArg = z.enum(PRIORITIES);
const dateArg = z.string().nullable().describe('YYYY-MM-DD in your time zone; null clears it.');

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** Text result, or a tool error Claude can read and fix. */
const text = (body: string): CallToolResult => ({ content: [{ type: 'text', text: body }] });

/** Explains failures in words Claude can act on; never includes the token. */
export function errorResult(err: unknown): CallToolResult {
  let message: string;
  if (err instanceof ToolError) message = err.message;
  else if (isApiError(err)) {
    if (err.status === 401) {
      message =
        'Kite rejected the token (revoked or expired). Create a new one in Kite: Settings → Connect Claude, then update KITE_TOKEN and restart Claude Desktop.';
    } else if (err.status === 404) message = `Not found in Kite (${err.message}).`;
    else message = `Kite said ${err.status} ${err.code}: ${err.message}`;
  } else if (err instanceof Error && err.name === 'ZodError') {
    message =
      'Kite answered in a format this server does not understand: the Kite server is probably newer than this kite-mcp build. Rebuild it (pnpm --filter @kite/mcp build) and restart Claude Desktop.';
  } else if (err instanceof NetworkError) {
    message = `Could not reach Kite at KITE_URL (${err.message}). Is the server running?`;
  } else {
    message = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { isError: true, content: [{ type: 'text', text: message }] };
}

const run =
  <A>(fn: (args: A) => Promise<string>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return text(await fn(args));
    } catch (err) {
      return errorResult(err);
    }
  };

/** A comment body: plain text, with `mentions` turned into real @mentions at the start. */
export function richBody(
  plain: string,
  mentions: readonly { id: string; name: string }[] = [],
): RichTextNode {
  const doc = plainToRichText(plain) ?? { type: 'doc', content: [{ type: 'paragraph' }] };
  if (mentions.length === 0) return doc;
  const lead: RichTextNode[] = mentions.flatMap((m) => [
    { type: 'mention', attrs: { id: m.id, label: shortName(m.name) } },
    { type: 'text', text: ' ' },
  ]);
  const [first, ...rest] = doc.content ?? [];
  const paragraph = first ?? { type: 'paragraph' };
  return {
    type: 'doc',
    content: [{ ...paragraph, content: [...lead, ...(paragraph.content ?? [])] }, ...rest],
  };
}

export function registerTools(server: McpServer, kite: Kite): void {
  const task = async (workspace: Workspace, key: string): Promise<TaskDetail> =>
    kite.api.apiFetch(
      `/tasks/${encodeURIComponent(taskKey(key))}${toQuery({ workspaceId: workspace.id })}`,
      taskDetailSchema,
    );

  const memberIds = async (workspace: Workspace, people: readonly string[]) => {
    const [members, me] = await Promise.all([kite.members(workspace.id), kite.me()]);
    return people.map((p) => matchMember(members, p, me.user.id).user);
  };

  server.registerTool(
    'list_workspaces',
    {
      title: 'List workspaces',
      description: 'Who I am in Kite and the workspaces I belong to (slug, name, my role).',
      annotations: READ,
    },
    run(async () => {
      const me = await kite.me();
      const lines = me.workspaces.map((w) => `${w.slug} · ${w.name} · ${w.role}`);
      return `Signed in as ${me.user.name} <${me.user.email}>, time zone ${me.preferences.timezone}.\n${section('Workspaces', lines)}`;
    }),
  );

  server.registerTool(
    'my_tasks',
    {
      title: 'My tasks',
      description:
        'My Tasks page: my open tasks grouped Overdue / Today / This week / Later, plus open tasks I requested from others. Dates are in my time zone.',
      inputSchema: {
        workspace: workspaceArg,
        include_done: z.boolean().default(false).describe('Also list tasks I completed this week.'),
      },
      annotations: READ,
    },
    run(async ({ workspace, include_done }) => {
      const ws = await kite.workspace(workspace);
      const home = await kite.api.apiFetch(
        `/me/home${toQuery({ workspaceId: ws.id })}`,
        homeSchema,
      );
      const s = home.sections;
      const parts = [
        `Today is ${home.today} (${home.timezone}). Workspace ${ws.slug}.`,
        section('Overdue', s.overdue.map(taskLine)),
        section('Today', s.today.filter((t) => !t.done).map(taskLine)),
        section('This week', s.thisWeek.map(taskLine)),
        section('Later', s.later.map(taskLine)),
        section('Requested by me (assigned to others)', s.requested.map(taskLine)),
      ];
      if (include_done) parts.push(section('Done this week', s.done.map(taskLine)));
      return parts.join('\n\n');
    }),
  );

  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search tasks, projects, people and comments in a workspace (like ⌘K).',
      inputSchema: { query: z.string().min(1).max(200), workspace: workspaceArg },
      annotations: READ,
    },
    run(async ({ query, workspace }) => {
      const ws = await kite.workspace(workspace);
      const r = await kite.api.apiFetch(
        `/workspaces/${ws.id}/search${toQuery({ q: query })}`,
        searchResultSchema,
      );
      return [
        section(
          'Tasks',
          r.tasks.map((t) =>
            [
              t.key,
              t.title,
              statusLabel(t.status),
              t.dueDate ? `due ${t.dueDate}` : null,
              names(t.assignees),
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ),
        section(
          'Projects',
          r.projects.map((p) => `${p.key} · ${p.name}`),
        ),
        section(
          'People',
          r.people.map((p) => p.name),
        ),
        section(
          'Comments',
          r.comments.map(
            (c) => `${c.task.key} · ${c.author.name}: ${userContent(c.snippet, 'comment snippet')}`,
          ),
        ),
      ].join('\n\n');
    }),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description:
        'Everything about one task: fields, description, subtasks, and (by default) its comments.',
      inputSchema: {
        key: keyArg,
        include_comments: z.boolean().default(true),
        workspace: workspaceArg,
      },
      annotations: READ,
    },
    run(async ({ key, include_comments, workspace }) => {
      const ws = await kite.workspace(workspace);
      const t = await task(ws, key);
      const lines = [
        `# ${t.key} · ${t.title}`,
        `Link: ${kite.taskUrl(ws, t.key)}`,
        `Project: ${t.project.key} (${t.project.name})`,
        `Status: ${statusLabel(t.status)} (${t.status.category})`,
        `Priority: ${t.priority}${t.size ? ` · Size ${t.size}` : ''}`,
        `Assignees: ${names(t.assignees)}`,
        `Reviewer: ${t.reviewer?.name ?? 'none'}`,
        `Start: ${t.startDate ?? '—'} · Due: ${t.dueDate ?? '—'}`,
        `Sprint: ${t.sprint ? (t.sprint.name ?? `Sprint ${t.sprint.number}`) : 'none'}`,
        `Tags: ${t.tags.map((g) => g.name).join(', ') || 'none'}`,
        `Created by ${t.creator.name} on ${t.createdAt.slice(0, 10)}; updated ${t.updatedAt.slice(0, 10)}`,
      ];
      if (t.deletedAt) lines.push('This task is deleted (in the trash).');
      if (t.blocked && t.status.category !== 'done') {
        lines.push(`Blocked (from ${t.blocked.groupName}'s standup on ${t.blocked.date}).`);
      }
      lines.push(
        '',
        '## Description',
        t.descriptionText.trim() ? userContent(t.descriptionText, 'task description') : 'none',
        '',
        section(
          `Subtasks (${t.subtaskProgress.done}/${t.subtaskProgress.total} done)`,
          t.subtasks.map((s) => `[${s.done ? 'x' : ' '}] ${s.title}`),
        ),
      );
      if (include_comments) {
        const comments = await kite.api.apiFetch(`/tasks/${t.id}/comments`, z.array(commentSchema));
        const thread = comments.flatMap((c) => [c, ...c.replies]);
        lines.push(
          '',
          `## Comments (${thread.length})`,
          ...thread.map((c) =>
            c.body === null
              ? '- (deleted comment)'
              : `- ${c.author.name}, ${c.createdAt.slice(0, 16).replace('T', ' ')} UTC:\n${userContent(c.bodyText, `comment by ${c.author.name}`)}`,
          ),
        );
      }
      return lines.join('\n');
    }),
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'Spaces and their open projects (key and name) in a workspace.',
      inputSchema: { workspace: workspaceArg },
      annotations: READ,
    },
    run(async ({ workspace }) => {
      const ws = await kite.workspace(workspace);
      const { spaces } = await kite.sidebar(ws.id);
      return spaces
        .map((s) =>
          section(
            s.name,
            s.projects.map((p) => `${p.key} · ${p.name}`),
          ),
        )
        .join('\n\n');
    }),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: `Tasks of one project, open ones by default, filtered by status, assignee or text. At most ${LIST_LIMIT} are listed.`,
      inputSchema: {
        project: z.string().describe('Project key (e.g. APP) or name.'),
        status: z
          .string()
          .optional()
          .describe(
            'Status name or category: todo, in_progress, review, on_hold, done, cancelled.',
          ),
        assignee: z.string().optional().describe('"me", "unassigned", a name or an email.'),
        query: z.string().min(1).max(200).optional().describe('Text in the title or description.'),
        include_done: z.boolean().default(false),
        workspace: workspaceArg,
      },
      annotations: READ,
    },
    run(async ({ project, status, assignee, query, include_done, workspace }) => {
      const ws = await kite.workspace(workspace);
      const p = await kite.project(ws.id, project);
      const statusId = status ? matchStatus(await kite.statuses(p.id), status).id : undefined;
      let assigneeId: string | undefined;
      if (assignee?.trim().toLowerCase() === 'unassigned') assigneeId = 'unassigned';
      else if (assignee) assigneeId = (await memberIds(ws, [assignee]))[0]?.id;
      const tasks = await kite.api.apiFetch(
        `/projects/${p.id}/tasks${toQuery({
          statusId,
          assigneeId,
          q: query,
          // A status filter on Done must see done tasks.
          includeDone: include_done || statusId !== undefined,
          sort: 'dueDate',
        })}`,
        z.array(taskListItemSchema),
      );
      const shown = tasks.slice(0, LIST_LIMIT).map(taskLine);
      const more =
        tasks.length > LIST_LIMIT
          ? `\n…and ${tasks.length - LIST_LIMIT} more; narrow the filter.`
          : '';
      return `${section(`${p.key} · ${p.name} (${tasks.length})`, shown)}${more}`;
    }),
  );

  server.registerTool(
    'list_members',
    {
      title: 'List members',
      description: 'People in a workspace: name, email, role, job title, and who is out of office.',
      inputSchema: { workspace: workspaceArg },
      annotations: READ,
    },
    run(async ({ workspace }) => {
      const ws = await kite.workspace(workspace);
      const members = await kite.members(ws.id);
      const today = new Date().toISOString().slice(0, 10);
      return section(
        `Members of ${ws.name}`,
        members.map((m) => {
          const away = m.absences.find((a) => a.startDate <= today && a.endDate >= today);
          return [
            m.user.name,
            m.user.email,
            m.role,
            m.title,
            away ? `out of office until ${away.endDate}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
        }),
      );
    }),
  );

  server.registerTool(
    'inbox',
    {
      title: 'Inbox',
      description:
        'My latest notifications (mentions, assignments, comments, status changes, standups).',
      inputSchema: {
        unread_only: z.boolean().default(true),
        limit: z.number().int().min(1).max(50).default(20),
        workspace: workspaceArg,
      },
      annotations: READ,
    },
    run(async ({ unread_only, limit, workspace }) => {
      const ws = await kite.workspace(workspace);
      const page = await kite.api.apiFetch(
        `/me/notifications${toQuery({ workspaceId: ws.id, limit })}`,
        notificationPageSchema,
      );
      const items = unread_only ? page.items.filter((n) => n.readAt === null) : page.items;
      const lines = items.map((n) => {
        const subject = n.task
          ? `${n.task.key} ${n.task.title}`
          : n.standup
            ? `standup ${n.standup.groupName} ${n.standup.date}`
            : '';
        const who = n.actor?.name ?? 'Kite';
        const snippet = n.snippet ? `\n${userContent(n.snippet, `${n.type} from ${who}`)}` : '';
        return `${n.readAt ? '' : '[unread] '}${n.type} · ${who} · ${subject} · ${n.createdAt.slice(0, 16).replace('T', ' ')} UTC${snippet}`;
      });
      return `${page.counts.unread} unread.\n${section('Notifications', lines)}`;
    }),
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task in a project as me. Defaults: first To Do status, no priority, unassigned.',
      inputSchema: {
        project: z.string().describe('Project key (e.g. APP) or name.'),
        title: z.string().min(1).max(500),
        description: z
          .string()
          .max(20_000)
          .optional()
          .describe('Plain text; blank lines split paragraphs.'),
        status: z.string().optional(),
        priority: priorityArg.optional(),
        assignees: z.array(z.string()).max(10).optional().describe('"me", names or emails.'),
        due_date: dateArg.optional(),
        workspace: workspaceArg,
      },
      annotations: WRITE,
    },
    run(
      async ({ project, title, description, status, priority, assignees, due_date, workspace }) => {
        const ws = await kite.workspace(workspace);
        const p = await kite.project(ws.id, project);
        const created = await kite.api.apiSend(
          `/projects/${p.id}/tasks`,
          taskDetailSchema,
          'POST',
          {
            title,
            ...(description ? { description: plainToRichText(description) } : {}),
            ...(status ? { statusId: matchStatus(await kite.statuses(p.id), status).id } : {}),
            ...(priority ? { priority } : {}),
            ...(assignees?.length
              ? { assigneeIds: (await memberIds(ws, assignees)).map((u) => u.id) }
              : {}),
            ...(due_date !== undefined ? { dueDate: parseDate(due_date) } : {}),
          },
        );
        return `Created ${taskLine(created)}\n${kite.taskUrl(ws, created.key)}`;
      },
    ),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Change a task: title, description, status, priority, due date, or assignees (replaces the list). Only the fields you pass change.',
      inputSchema: {
        key: keyArg,
        title: z.string().min(1).max(500).optional(),
        description: z
          .string()
          .max(20_000)
          .nullable()
          .optional()
          .describe('Plain text; replaces the description. null clears it.'),
        status: z.string().optional().describe('Status name or category.'),
        priority: priorityArg.optional(),
        due_date: dateArg.optional(),
        assignees: z
          .array(z.string())
          .max(10)
          .optional()
          .describe('The full new list: "me", names or emails; [] unassigns everyone.'),
        workspace: workspaceArg,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(async ({ key, title, description, status, priority, due_date, assignees, workspace }) => {
      const ws = await kite.workspace(workspace);
      let t = await task(ws, key);
      if (t.deletedAt) throw new ToolError(`${t.key} is deleted; restore it in Kite first.`);
      const patch = {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined
          ? { description: description === null ? null : plainToRichText(description) }
          : {}),
        ...(status ? { statusId: matchStatus(await kite.statuses(t.project.id), status).id } : {}),
        ...(priority ? { priority } : {}),
        ...(due_date !== undefined ? { dueDate: parseDate(due_date) } : {}),
      };
      // Resolve people before writing anything, so a bad name changes nothing.
      const userIds = assignees ? (await memberIds(ws, assignees)).map((u) => u.id) : undefined;
      if (Object.keys(patch).length === 0 && userIds === undefined) {
        throw new ToolError('Nothing to change: pass at least one field.');
      }
      if (Object.keys(patch).length > 0) {
        t = await kite.api.apiSend(`/tasks/${t.id}`, taskDetailSchema, 'PATCH', patch);
      }
      if (userIds !== undefined) {
        const row = await kite.api.apiSend(`/tasks/${t.id}/assignees`, taskListItemSchema, 'PUT', {
          userIds,
        });
        return `Updated ${taskLine(row)}`;
      }
      return `Updated ${taskLine(t)}`;
    }),
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete task',
      description: 'Mark a task done (or reopen it with done: false).',
      inputSchema: { key: keyArg, done: z.boolean().default(true), workspace: workspaceArg },
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(async ({ key, done, workspace }) => {
      const ws = await kite.workspace(workspace);
      const t = await task(ws, key);
      const row = await kite.api.apiSend(`/tasks/${t.id}/complete`, taskListItemSchema, 'POST', {
        done,
      });
      return `${done ? 'Completed' : 'Reopened'} ${taskLine(row)}`;
    }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Comment on a task as me. People in `mention` are @mentioned at the start (they get notified).',
      inputSchema: {
        key: keyArg,
        text: z.string().min(1).max(20_000).describe('Plain text; blank lines split paragraphs.'),
        mention: z.array(z.string()).max(10).optional().describe('Names or emails to @mention.'),
        workspace: workspaceArg,
      },
      annotations: WRITE,
    },
    run(async ({ key, text: body, mention, workspace }) => {
      const ws = await kite.workspace(workspace);
      const t = await task(ws, key);
      const people = mention?.length ? await memberIds(ws, mention) : [];
      await kite.api.apiSend(`/tasks/${t.id}/comments`, commentSchema, 'POST', {
        body: richBody(body, people),
      });
      const tagged = people.length ? ` (mentioned: ${people.map((p) => p.name).join(', ')})` : '';
      return `Commented on ${t.key}${tagged}\n${kite.taskUrl(ws, t.key)}`;
    }),
  );
}
