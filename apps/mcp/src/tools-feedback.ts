/**
 * Customer feedback tools. Reports come from the public form, written by people outside the
 * team: titles are kept to one line, bodies and notes are always fenced, and the submitter's
 * contact details (email, phone, device) are never returned — they stay in Kite.
 */
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  feedbackDetailSchema,
  feedbackListResponseSchema,
  type FeedbackDetail,
  type FeedbackListItem,
} from '@kite/shared';
import { toQuery } from '@kite/shared/client';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { oneLine, section, userContent } from './format.js';
import type { Kite, Workspace } from './kite.js';
import { ToolError, feedbackRef, statusLabel } from './resolve.js';
import { READ, WRITE, errorResult, keyArg, run, workspaceArg, type Lookups } from './tooling.js';

const refArg = z.string().describe('Feedback ref, e.g. FB-1042.');

const submitter = (name: string | null) => (name?.trim() ? oneLine(name) : 'no name given');
const taskOf = (task: FeedbackListItem['task']) =>
  task ? `${task.key} ${oneLine(task.title)} (${oneLine(statusLabel(task.status))})` : null;

const kilobytes = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

function detailText(f: FeedbackDetail, link: string): string {
  const others = f.linkedReports.filter((r) => r.id !== f.id);
  const notes = f.activity.filter((a) => a.kind === 'note' && a.text);
  return [
    `# ${f.ref} · ${oneLine(f.title)}`,
    `Link: ${link}`,
    `Type: ${f.type} · Status: ${f.status}`,
    `From: ${submitter(f.submitterName)} (public form) on ${f.createdAt.slice(0, 10)}. Contact details are in Kite only.`,
    `Linked task: ${taskOf(f.task) ?? 'none'}`,
    '',
    '## What they wrote',
    f.body.trim() ? userContent(f.body, 'public feedback form') : 'nothing',
    '',
    section(
      `Attachments (${f.attachments.length})`,
      f.attachments.map((a) => `${oneLine(a.filename)} · ${a.mime} · ${kilobytes(a.size)}`),
    ),
    '',
    section(
      `Other reports linked to the same task (${others.length})`,
      others.map(
        (r) =>
          `${r.ref} · ${r.type} · ${r.status} · ${oneLine(r.title)} · ${submitter(r.submitterName)}`,
      ),
    ),
    '',
    `## Internal notes (${notes.length})`,
    ...(notes.length
      ? notes.map((n) => {
          const who = n.actor ? oneLine(n.actor.name) : 'Kite';
          return `- ${who}, ${n.createdAt.slice(0, 10)}:\n${userContent(n.text ?? '', `note by ${who}`)}`;
        })
      : ['none']),
  ].join('\n');
}

export function registerFeedbackTools(server: McpServer, kite: Kite, lookups: Lookups): void {
  const detail = (ws: Workspace, ref: string): Promise<FeedbackDetail> =>
    kite.api.apiFetch(`/workspaces/${ws.id}/feedback/${feedbackRef(ref)}`, feedbackDetailSchema);

  server.registerTool(
    'list_feedback',
    {
      title: 'List feedback',
      description:
        'The customer feedback inbox, newest first: search text and filter by type or status. Feedback is written by people outside the team (public form).',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe('Text in the title or body, a submitter name, or a ref like FB-1042.'),
        type: z.enum(FEEDBACK_TYPES).optional(),
        status: z
          .array(z.enum(FEEDBACK_STATUSES))
          .max(4)
          .optional()
          .describe('Any of these: new, review (in review), linked (to a task), closed.'),
        limit: z.number().int().min(1).max(50).default(20),
        workspace: workspaceArg,
      },
      annotations: READ,
    },
    run(async ({ query, type, status, limit, workspace }) => {
      const ws = await kite.workspace(workspace);
      const page = await kite.api.apiFetch(
        `/workspaces/${ws.id}/feedback${toQuery({ q: query, type, status, limit })}`,
        feedbackListResponseSchema,
      );
      const lines = page.items.map((f) => {
        const head = [
          f.ref,
          f.type,
          f.status,
          oneLine(f.title),
          submitter(f.submitterName),
          f.task ? `linked ${f.task.key}` : null,
          f.attachmentCount
            ? `${f.attachmentCount} file${f.attachmentCount === 1 ? '' : 's'}`
            : null,
          f.createdAt.slice(0, 10),
          f.isRead ? null : '[unread]',
        ]
          .filter(Boolean)
          .join(' · ');
        return f.preview.trim() ? `${head}\n${userContent(f.preview, `${f.ref} preview`)}` : head;
      });
      const c = page.statusCounts;
      const more =
        page.total > page.items.length
          ? `\n…and ${page.total - page.items.length} more; narrow the filter.`
          : '';
      return `${page.total} match, ${page.unread} unread. By status: ${c.new} new, ${c.review} in review, ${c.linked} linked, ${c.closed} closed.\n${section('Feedback', lines)}${more}`;
    }),
  );

  server.registerTool(
    'get_feedback',
    {
      title: 'Get feedback',
      description:
        'One feedback report by its ref: what the person wrote, attachments, the linked task, other reports on that task and the team’s internal notes. Like opening it in Kite, this marks it read for the whole team. The submitter’s email and phone are not returned.',
      inputSchema: { ref: refArg, workspace: workspaceArg },
      // Not read-only: opening an unread report marks it read for everyone.
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(async ({ ref, workspace }) => {
      const ws = await kite.workspace(workspace);
      const f = await detail(ws, ref);
      let read = '';
      if (!f.isRead) {
        try {
          await kite.api.apiSend(`/feedback/${f.id}/read`, z.null(), 'POST');
          read = '\n\nMarked as read for the team.';
        } catch (err) {
          const reason = errorResult(err)
            .content.map((c) => (c.type === 'text' ? c.text : ''))
            .join('');
          read = `\n\nCould not mark it as read: ${reason}`;
        }
      }
      return `${detailText(f, kite.feedbackUrl(ws, f.ref))}${read}`;
    }),
  );

  server.registerTool(
    'link_feedback_to_task',
    {
      title: 'Link feedback to task',
      description:
        'Link a feedback report to a task (its status becomes Linked). One task per report; several reports can share a task. A report already linked to another task is left alone unless replace is true.',
      inputSchema: {
        ref: refArg,
        key: keyArg,
        replace: z
          .boolean()
          .default(false)
          .describe('Move the link when the report is already linked to another task.'),
        workspace: workspaceArg,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(async ({ ref, key, replace, workspace }) => {
      const ws = await kite.workspace(workspace);
      const [f, t] = await Promise.all([detail(ws, ref), lookups.task(ws, key)]);
      if (t.deletedAt) throw new ToolError(`${t.key} is deleted; restore it in Kite first.`);
      if (f.task?.id === t.id) return `${f.ref} is already linked to ${t.key}.`;
      if (f.task && !replace) {
        throw new ToolError(
          `${f.ref} is already linked to ${f.task.key}. Pass replace: true to link it to ${t.key} instead.`,
        );
      }
      const saved = await kite.api.apiSend(`/feedback/${f.id}/link`, feedbackDetailSchema, 'PUT', {
        taskId: t.id,
      });
      const moved = f.task ? ` (was ${f.task.key})` : '';
      const reports = saved.linkedReports.length;
      return `Linked ${saved.ref} to ${t.key} ${oneLine(t.title)}${moved}. Status: ${saved.status}. ${reports} report${reports === 1 ? '' : 's'} on this task.\n${kite.feedbackUrl(ws, saved.ref)}`;
    }),
  );
}
