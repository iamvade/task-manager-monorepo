/** Subtask tools: add one, check one off (or uncheck it). `get_task` lists them. */
import { subtaskSchema } from '@kite/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { oneLine } from './format.js';
import type { Kite } from './kite.js';
import { ToolError, matchSubtask, parseDate } from './resolve.js';
import { WRITE, keyArg, run, workspaceArg, type Lookups } from './tooling.js';

export function registerSubtaskTools(server: McpServer, kite: Kite, lookups: Lookups): void {
  server.registerTool(
    'add_subtask',
    {
      title: 'Add subtask',
      description:
        'Add a subtask at the end of a task’s list, optionally assigned and with a due date.',
      inputSchema: {
        key: keyArg,
        title: z.string().min(1).max(500),
        assignee: z.string().optional().describe('"me", a name or an email.'),
        due_date: z.string().optional().describe('YYYY-MM-DD in your time zone.'),
        workspace: workspaceArg,
      },
      annotations: WRITE,
    },
    run(async ({ key, title, assignee, due_date, workspace }) => {
      const ws = await kite.workspace(workspace);
      const t = await lookups.task(ws, key);
      if (t.deletedAt) throw new ToolError(`${t.key} is deleted; restore it in Kite first.`);
      // Resolve everything before writing, so a bad name or date adds nothing.
      const [person] = assignee ? await lookups.people(ws, [assignee]) : [];
      const dueDate = due_date === undefined ? undefined : parseDate(due_date);
      const created = await kite.api.apiSend(`/tasks/${t.id}/subtasks`, subtaskSchema, 'POST', {
        title,
        ...(person ? { assigneeId: person.id } : {}),
        ...(dueDate ? { dueDate } : {}),
      });
      const extras = [
        created.assignee ? oneLine(created.assignee.name) : null,
        created.dueDate ? `due ${created.dueDate}` : null,
      ].filter(Boolean);
      return `Added subtask ${t.subtasks.length + 1} to ${t.key}: ${oneLine(created.title)}${extras.length ? ` (${extras.join(', ')})` : ''}\n${kite.taskUrl(ws, t.key)}`;
    }),
  );

  server.registerTool(
    'complete_subtask',
    {
      title: 'Complete subtask',
      description:
        'Check off one subtask of a task (or uncheck it with done: false). Name it by its position in get_task’s list (1 = first) or its exact title.',
      inputSchema: {
        key: keyArg,
        subtask: z
          .union([z.string().min(1).max(500), z.number().int().min(1)])
          .describe('Position in the list (1 = first) or the exact title.'),
        done: z.boolean().default(true),
        workspace: workspaceArg,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(async ({ key, subtask, done, workspace }) => {
      const ws = await kite.workspace(workspace);
      const t = await lookups.task(ws, key);
      if (t.deletedAt) throw new ToolError(`${t.key} is deleted; restore it in Kite first.`);
      const found = matchSubtask(t.subtasks, String(subtask));
      const label = `"${oneLine(found.title)}" on ${t.key}`;
      if (found.done === done) return `Already ${done ? 'done' : 'not done'}: ${label}`;
      const saved = await kite.api.apiSend(`/subtasks/${found.id}`, subtaskSchema, 'PATCH', {
        done,
      });
      const total = t.subtasks.length;
      const doneCount = t.subtasks.filter((s) => (s.id === saved.id ? saved.done : s.done)).length;
      return `${saved.done ? 'Checked off' : 'Unchecked'} ${label} (${doneCount}/${total} done)`;
    }),
  );
}
