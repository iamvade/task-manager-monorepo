/**
 * Standup tools: read my group's day and write my own update. Standup content is for a group's
 * members only, updates are written on the group's today, and a posted update never goes back
 * to a draft — the API enforces all three; these tools explain them instead of failing late.
 */
import {
  MAX_STANDUP_BLOCKERS,
  MAX_STANDUP_ITEMS,
  standupDaySchema,
  standupEntrySchema,
  standupSuggestionsSchema,
  type SaveStandupEntry,
  type StandupBlocker,
  type StandupDay,
  type StandupEntry,
  type StandupGroup,
  type StandupSuggestions,
  type StandupTaskRef,
  type TaskDetail,
} from '@kite/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { oneLine, section, userContent } from './format.js';
import type { Kite, Workspace } from './kite.js';
import { ToolError, matchMember, matchStandupGroup } from './resolve.js';
import { READ, WRITE, run, workspaceArg, type Lookups } from './tooling.js';

type Body = Required<Pick<SaveStandupEntry, 'yesterday' | 'today' | 'blockers'>>;

const groupArg = z
  .string()
  .optional()
  .describe('Standup group name; only needed when you are in several.');

const itemArg = z.object({
  text: z.string().max(500).optional().describe('What you did / will do, in one line.'),
  task: z
    .string()
    .optional()
    .describe('Task key to link, e.g. APP-142 (text defaults to its title).'),
});
const blockerArg = z.object({
  text: z.string().min(1).max(500),
  task: z.string().optional().describe('Task key this blocks, e.g. APP-142.'),
  helpers: z
    .array(z.string())
    .max(10)
    .optional()
    .describe('Other group members who can help (names or emails); they are notified.'),
});

const clock = (iso: string) => `${iso.slice(11, 16)} UTC`;
const fold = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const taskRef = (task: StandupTaskRef) => `${task.key} ${oneLine(task.title)}`;

/** An update's own words, as plain lines (the caller fences them). */
function entryLines(entry: StandupEntry): string[] {
  const item = (i: { kind: string; text: string; task: StandupTaskRef | null }) =>
    `- ${i.kind === 'text' || i.kind === 'task' ? '' : `[${i.kind}] `}${i.task ? `${i.task.key} · ` : ''}${oneLine(i.text)}`;
  const lines = [
    'Yesterday:',
    ...(entry.yesterday.length ? entry.yesterday.map(item) : ['- nothing']),
    'Today:',
    ...(entry.today.length ? entry.today.map(item) : ['- nothing']),
  ];
  if (entry.blockers.length) {
    lines.push(
      'Blockers:',
      ...entry.blockers.map(
        (b) =>
          `- ${b.resolvedAt ? '[resolved] ' : ''}${b.task ? `${b.task.key} · ` : ''}${oneLine(b.text)}`,
      ),
    );
  }
  if (entry.replies.length) {
    lines.push(
      'Replies:',
      ...entry.replies.map((r) => `- ${oneLine(r.author.name)}: ${oneLine(r.body)}`),
    );
  }
  return lines;
}

function blockerBlock(b: StandupBlocker): string {
  const head = [
    oneLine(b.author.name),
    `since ${b.date}`,
    b.task ? `blocks ${taskRef(b.task)}` : null,
    b.helpers.length ? `can help: ${b.helpers.map((h) => oneLine(h.name)).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${head}\n${userContent(b.text, `blocker by ${b.author.name}`)}`;
}

function dayText(day: StandupDay, suggestions: StandupSuggestions, link: string): string {
  const g = day.group;
  const schedule = day.isStandupDay
    ? `Standup day; post by ${g.postBy} (${g.timezone}). Posted ${day.postedCount}/${day.expectedCount}.`
    : `No standup today${day.upcomingDate ? `; the next one is ${day.upcomingDate}` : ''}.`;
  const who = day.members.map((m) => {
    const state =
      m.state === 'posted'
        ? `posted${m.postedAt ? ` ${clock(m.postedAt)}` : ''}${m.isLate ? ' (late)' : ''}`
        : m.state === 'out'
          ? `out of office${m.backOn ? `, back ${m.backOn}` : ''}`
          : 'not yet';
    return `${oneLine(m.user.name)} · ${state}`;
  });
  const open = day.blockers.filter((b) => b.resolvedAt === null);
  const mine = day.myEntry;
  const others = day.entries.filter((e) => e.id !== mine?.id);
  const parts = [
    `# Standup · ${oneLine(g.name)} · ${day.date}`,
    `Link: ${link}`,
    schedule,
    '',
    section('Who', who),
    '',
    section(`Open blockers (${open.length})`, open.map(blockerBlock)),
    '',
    `## My update: ${mine ? (mine.status === 'posted' ? `posted${mine.postedAt ? ` ${clock(mine.postedAt)}` : ''}` : 'draft, not posted yet') : 'not written yet'}`,
    ...(mine ? [userContent(entryLines(mine).join('\n'), 'my standup update')] : []),
    '',
    `## Updates from others (${others.length})`,
    ...(others.length
      ? others.map(
          (e) =>
            `### ${oneLine(e.user.name)}${e.postedAt ? ` · ${clock(e.postedAt)}` : ''}\n${userContent(entryLines(e).join('\n'), `standup update by ${e.user.name}`)}`,
        )
      : ['none']),
    '',
    section(
      `Suggested for Yesterday (my activity since ${suggestions.previousDate ?? 'the last standup'})`,
      suggestions.yesterday.map((s) => `${s.kind} · ${taskRef(s.task)}`),
    ),
    '',
    section(
      'Suggested for Today (my open tasks)',
      suggestions.today.map((s) => `${s.tag} · ${taskRef(s.task)}`),
    ),
  ];
  return parts.join('\n');
}

export function registerStandupTools(server: McpServer, kite: Kite, lookups: Lookups): void {
  /** My group (members only, checked before any content is asked for), its today and my suggestions. */
  const load = async (ws: Workspace, groupName: string | undefined) => {
    const group = matchStandupGroup(await kite.standupGroups(ws.id), groupName);
    // `today` is the group's local day, which the server knows; never the person's own zone.
    const [day, suggestions] = await Promise.all([
      kite.api.apiFetch(`/standup-groups/${group.id}/days/today`, standupDaySchema),
      kite.api.apiFetch(`/standup-groups/${group.id}/suggestions`, standupSuggestionsSchema),
    ]);
    return { group, day, suggestions };
  };

  server.registerTool(
    'standup_today',
    {
      title: 'Standup today',
      description:
        'Today in my standup group: who has posted, open blockers, my own update or draft, everyone’s updates, and suggestions for my update (what I did since the last standup, my open tasks). Read this before post_standup.',
      inputSchema: { group: groupArg, workspace: workspaceArg },
      annotations: READ,
    },
    run(async ({ group, workspace }) => {
      const ws = await kite.workspace(workspace);
      const { day, suggestions } = await load(ws, group);
      return dayText(day, suggestions, kite.standupUrl(ws, day.group.id, day.date));
    }),
  );

  server.registerTool(
    'post_standup',
    {
      title: 'Post standup',
      description:
        'Write my standup update for today in my group and post it (or save it as a private draft with draft: true). Only the sections passed change: omit one to keep what is there, pass [] to empty it. Editing an already posted update keeps it posted; its existing blockers are never removed. With no sections, posts my saved draft as it is. Teammates see a posted update and named helpers are notified.',
      inputSchema: {
        yesterday: z.array(itemArg).max(MAX_STANDUP_ITEMS).optional(),
        today: z.array(itemArg).max(MAX_STANDUP_ITEMS).optional(),
        blockers: z.array(blockerArg).max(MAX_STANDUP_BLOCKERS).optional(),
        draft: z.boolean().default(false).describe('Save privately instead of posting.'),
        group: groupArg,
        workspace: workspaceArg,
      },
      annotations: WRITE,
    },
    run(async ({ yesterday, today, blockers, draft, group, workspace }) => {
      const ws = await kite.workspace(workspace);
      const { day, suggestions } = await load(ws, group);
      const name = oneLine(day.group.name);
      if (!day.isStandupDay) {
        throw new ToolError(
          `${name} has no standup today (${day.date})${day.upcomingDate ? `; the next one is ${day.upcomingDate}` : ''}. Updates can only be written on a standup day.`,
        );
      }
      if (!day.editable) throw new ToolError(`Today's update in ${name} can't be changed.`);
      const mine = day.myEntry;
      const posted = mine?.status === 'posted';
      if (draft && posted) {
        throw new ToolError(
          'Your update is already posted; a posted update cannot go back to a draft. Call post_standup without draft to edit it.',
        );
      }
      const nothingPassed =
        yesterday === undefined && today === undefined && blockers === undefined;
      if (nothingPassed && (!mine || posted || draft)) {
        throw new ToolError(
          mine
            ? 'Nothing to change: pass yesterday, today or blockers.'
            : 'Nothing to post: pass yesterday, today or blockers (standup_today has suggestions).',
        );
      }

      // Resolve every task and person before writing, so a bad key or name saves nothing.
      const keys = [...(yesterday ?? []), ...(today ?? []), ...(blockers ?? [])].flatMap(
        (i) => i.task ?? [],
      );
      const tasks = new Map<string, TaskDetail>();
      for (const key of new Set(keys)) tasks.set(key, await lookups.task(ws, key));
      const linked = (key: string | undefined) => (key === undefined ? undefined : tasks.get(key));
      const itemText = (i: z.infer<typeof itemArg>, task: TaskDetail | undefined) => {
        const own = i.text?.trim();
        const words = (own !== undefined && own !== '' ? own : (task?.title ?? '')).slice(0, 500);
        if (!words) throw new ToolError('Each standup item needs `text` or a `task` key.');
        return words;
      };
      const helperIds = await helpersOf(kite, ws, day.group, blockers ?? []);

      const kept = keepEntry(mine, day.group);
      const body: Body = {
        yesterday:
          yesterday?.map((i) => {
            const task = linked(i.task);
            // A suggested task keeps its kind ("completed", "review", "commented").
            const kind = suggestions.yesterday.find((s) => s.task.id === task?.id)?.kind ?? 'text';
            return { kind, ...(task ? { taskId: task.id } : {}), text: itemText(i, task) };
          }) ?? kept.yesterday,
        today:
          today?.map((i) => {
            const task = linked(i.task);
            return task
              ? { kind: 'task' as const, taskId: task.id, text: itemText(i, task) }
              : { kind: 'text' as const, text: itemText(i, undefined) };
          }) ?? kept.today,
        blockers: kept.blockers,
      };
      if (blockers) {
        const passed = blockers.map((b, index) => {
          const old = kept.blockers.find((k) => fold(k.text) === fold(b.text));
          return {
            ...(old?.id ? { id: old.id } : {}),
            text: b.text.trim(),
            taskId: b.task === undefined ? (old?.taskId ?? null) : (linked(b.task)?.id ?? null),
            helperIds: b.helpers === undefined ? (old?.helperIds ?? []) : (helperIds[index] ?? []),
          };
        });
        const passedIds = new Set(passed.flatMap((b) => b.id ?? []));
        // A posted update's blockers carry replies and a resolved state: they are never dropped
        // here. A draft's are simply replaced by the list given.
        body.blockers = posted
          ? [...kept.blockers.filter((k) => k.id === undefined || !passedIds.has(k.id)), ...passed]
          : passed;
      }
      if (body.blockers.length > MAX_STANDUP_BLOCKERS) {
        throw new ToolError(`An update holds at most ${MAX_STANDUP_BLOCKERS} blockers.`);
      }
      if (!draft && body.yesterday.length + body.today.length + body.blockers.length === 0) {
        throw new ToolError('An empty update can’t be posted.');
      }

      const saved = await kite.api.apiSend(
        `/standup-groups/${day.group.id}/days/today/entry`,
        standupEntrySchema,
        'PUT',
        { status: draft ? 'draft' : 'posted', ...body },
      );
      const verb = draft
        ? mine
          ? 'Saved your draft (not posted)'
          : 'Saved a draft (not posted)'
        : posted
          ? 'Updated your posted update'
          : mine
            ? 'Posted your draft'
            : 'Posted your update';
      const counts = `${saved.yesterday.length} yesterday, ${saved.today.length} today, ${saved.blockers.length} blocker${saved.blockers.length === 1 ? '' : 's'}`;
      const late = !draft && !posted && saved.isLate ? ' It is after the post-by time.' : '';
      return `${verb} in ${name} for ${saved.date}: ${counts}.${late}\n${kite.standupUrl(ws, day.group.id, saved.date)}`;
    }),
  );
}

/** My saved update as the API takes it back, so untouched sections and blockers stay as they are. */
function keepEntry(entry: StandupEntry | null, group: StandupGroup): Body {
  if (!entry) return { yesterday: [], today: [], blockers: [] };
  const members = new Set(group.members.map((m) => m.user.id));
  return {
    // Like the web: a linked task that was deleted since is sent as plain text.
    yesterday: entry.yesterday.map((i) => ({
      kind: i.kind,
      ...(i.task ? { taskId: i.task.id } : {}),
      text: i.text,
    })),
    today: entry.today.map((i) => ({
      kind: i.kind,
      ...(i.task ? { taskId: i.task.id } : {}),
      text: i.text,
    })),
    blockers: entry.blockers.map((b) => ({
      id: b.id,
      text: b.text,
      taskId: b.task?.id ?? null,
      // Someone who left the group since can't be named again.
      helperIds: b.helpers.map((h) => h.id).filter((id) => members.has(id)),
    })),
  };
}

/** Helper ids per blocker. Helpers are other members of the group, not anyone in the workspace. */
async function helpersOf(
  kite: Kite,
  ws: Workspace,
  group: StandupGroup,
  blockers: readonly z.infer<typeof blockerArg>[],
): Promise<string[][]> {
  if (!blockers.some((b) => b.helpers?.length)) return blockers.map(() => []);
  const [members, me] = await Promise.all([kite.members(ws.id), kite.me()]);
  const inGroup = new Set(group.members.map((m) => m.user.id));
  const others = members.filter((m) => inGroup.has(m.user.id) && m.user.id !== me.user.id);
  const list = others.map((m) => m.user.name).join(', ') || 'nobody else';
  return blockers.map((b) =>
    (b.helpers ?? []).map((query) => {
      if (/^@?(me|myself)$/i.test(query.trim())) {
        throw new ToolError('You can’t name yourself as a helper on your own blocker.');
      }
      return matchMember(
        others,
        query,
        me.user.id,
        `among the other members of ${oneLine(group.name)} (${list}).`,
      ).user.id;
    }),
  );
}
