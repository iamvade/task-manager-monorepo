# Kite MCP server (`@kite/mcp`)

Last updated: 2026-11-11 08:31 PM CST

A local [MCP](https://modelcontextprotocol.io) server that lets **Claude Desktop** read your Kite tasks and make everyday changes **as you**. Claude Desktop starts it as a child process and talks to it over stdio. The server calls the normal Kite REST API (`/api/v1`) with a personal token, so access checks, activity history, notifications and realtime updates work exactly as in the web app.

It ships as a **Claude Desktop extension** (`kite-tasks.mcpb`) that every Kite server serves from Settings → Claude, so teammates install it with a double-click: no checkout, no Node (Claude Desktop brings its own). A remote connector with OAuth (Claude on the web and phone) comes later.

## Contents

- [Install the extension](#install-the-extension)
- [Setup from a checkout (developers)](#setup-from-a-checkout-developers)
- [Tools](#tools)
- [How it resolves names](#how-it-resolves-names)
- [Security](#security)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Install the extension

1. In Kite, open **Settings → Claude**, name the token if you like, and click **Create token**. The token is shown once.
2. Click **Download for Claude Desktop** and open `kite-tasks.mcpb`. Claude Desktop shows the extension and asks for its settings:
   - **Kite address**: copy it from the same page (the address you open Kite at, including any sub-path).
   - **Kite token**: the token from step 1. Claude Desktop keeps it in the system keychain.
   - **Workspace** (optional): a workspace slug, when you are in several.
3. Ask Claude something like "what's on my plate today in Kite?"

After a Kite update, download the extension again from the same page and open it to replace the old one; Claude Desktop shows the installed version. The extension is not signed, so Claude Desktop may say so when it installs.

<sub>[↑ Back to contents](#contents)</sub>

## Setup from a checkout (developers)

Without the extension, e.g. against a development server, which doesn't serve one. Settings → Claude then shows only the manual config.

1. **Build the server** (Node 22.12+, from the repo root):

   ```bash
   pnpm install
   pnpm --filter @kite/mcp build   # → apps/mcp/dist/index.js (one bundled file)
   ```

2. **Create a token** in Kite: **Settings → Claude → Create token**. The token is shown once, with a ready `claude_desktop_config.json` entry (under "Set up without the extension" when the extension is available).

3. **Add it to Claude Desktop**: merge the entry into its `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; the app's developer settings can open it) and replace the path with your checkout's absolute path:

   ```json
   {
     "mcpServers": {
       "kite-tasks": {
         "command": "node",
         "args": ["/absolute/path/to/kite-tasks/apps/mcp/dist/index.js"],
         "env": {
           "KITE_URL": "https://kite.example.com",
           "KITE_TOKEN": "<token from Settings → Claude>",
           "KITE_WORKSPACE": "kite-studio"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop.** "kite-tasks" then shows among its connected tools; ask something like "what's on my plate today in Kite?"

| Variable         | Required | Meaning                                                                                                                                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KITE_URL`       | yes      | The address you open Kite at, including any sub-path (`https://host/task-manager`). In development use the web dev server (`http://localhost:5173`, which proxies `/api`) so task links open in the app. |
| `KITE_TOKEN`     | yes      | Token from Settings → Claude (43 characters).                                                                                                                                                            |
| `KITE_WORKSPACE` | no       | Workspace slug used when a request doesn't name one. Without it, the server uses your only workspace, or asks Claude to pick when you are in several.                                                    |

If `node` isn't found (Claude Desktop doesn't load your shell's `PATH`), put the absolute path from `which node` in `command`.

<sub>[↑ Back to contents](#contents)</sub>

## Tools

| Tool                    | Kind  | What it does                                                                                           |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| `list_workspaces`       | read  | Who I am, my workspaces and roles                                                                      |
| `my_tasks`              | read  | My Tasks: Overdue / Today / This week / Later, plus tasks I requested                                  |
| `search`                | read  | Tasks, projects, people and comments (like ⌘K)                                                         |
| `get_task`              | read  | One task: fields, description, subtasks, comments, link                                                |
| `list_projects`         | read  | Spaces and open projects                                                                               |
| `list_tasks`            | read  | A project's tasks, filtered by status, assignee or text (≤ 100)                                        |
| `list_members`          | read  | People: name, email, role, title, out of office                                                        |
| `inbox`                 | read  | Latest notifications                                                                                   |
| `create_task`           | write | New task: status, priority, assignees, due date, description                                           |
| `update_task`           | write | Title, description, status, priority, due date, assignees                                              |
| `complete_task`         | write | Mark done or reopen                                                                                    |
| `add_comment`           | write | Comment, optionally @mentioning people                                                                 |
| `add_subtask`           | write | New subtask at the end of a task's list: assignee, due date                                            |
| `complete_subtask`      | write | Check off a subtask by position or exact title, or uncheck it                                          |
| `standup_today`         | read  | My standup group today: who posted, open blockers, my update or draft, everyone's updates, suggestions |
| `post_standup`          | write | Write my update (yesterday, today, blockers with a linked task and helpers); post it or save a draft   |
| `list_feedback`         | read  | Feedback inbox: search, type, status (≤ 50)                                                            |
| `get_feedback`          | write | One report by ref (`FB-1042`): body, attachments, linked task, notes. Marks it read for the team       |
| `link_feedback_to_task` | write | Link a report to a task; moves an existing link only with `replace`                                    |

Read tools carry `readOnlyHint`, so Claude Desktop can treat them differently from writes. Nothing deletes, archives, or changes settings or membership.

**Subtasks.** `get_task` numbers the subtasks; `complete_subtask` takes that position (1 = first) or the exact title. A title several subtasks share fails with their positions.

**Standups.** Kite's rules hold, and the tools explain them instead of failing late:

- Content is for the group's members only. A group you are not in is refused before any update is requested.
- The day is always the group's own today (its time zone, not yours). On a day without a standup, `post_standup` says when the next one is.
- `post_standup` changes only the sections you pass: omit `yesterday`, `today` or `blockers` to keep what is there, pass `[]` to empty one. With no sections it posts your saved draft as it is.
- A posted update stays posted (`draft: true` is refused) and its blockers are never removed, since they carry replies and a resolved state. A blocker passed with the same text as an existing one updates that one; others are added. A draft's blockers are replaced by the list given.
- An item is `{ text }`, `{ task }` (its title becomes the text) or both. Yesterday items for a task that `standup_today` suggested keep the suggestion's kind (completed, review, commented). Nothing is filled in automatically.
- Helpers must be other members of the group; they are notified when the update is posted.

**Feedback.** Reports come from the public form. `list_feedback` and `get_feedback` never return the submitter's email, phone, device or user agent (the name only); open the report in Kite for those. `get_feedback` marks an unread report read for the whole team, exactly like opening it in the web app, which is why it is not a read-only tool.

<sub>[↑ Back to contents](#contents)</sub>

## How it resolves names

`src/resolve.ts` turns words into ids and **never guesses**: when nothing matches, or several things do, the tool fails with the list of choices.

- **Projects**: by key (`APP`, any case) or exact name.
- **Statuses**: by the project's own name, the default names in English or Mongolian ("In Review", "Хийгдэж буй"), or a category (`todo`, `in_progress`, `review`, `on_hold`, `done`, `cancelled`).
- **People**: `me`, an email, a full name, a first name, or the start of a name, matched across scripts ("Bat" finds "Бат", see `nameSearchKey`). Deactivated members never match.
- **Dates**: `YYYY-MM-DD` only, a real calendar day; `null` clears.
- **Subtasks**: a position in the task's list or the exact title (case and spacing aside).
- **Standup groups**: only groups you are a member of: your only one, else the exact name or a unique start of it.
- **Standup helpers**: like people, but only among the other members of the group.
- **Feedback**: by ref (`FB-1042`, any case).

<sub>[↑ Back to contents](#contents)</sub>

## Security

- **The token is your whole account.** The server only limits _which_ actions Claude can take. The API sees the token as you, so anyone holding it could do anything you can. Keep it out of shared files and revoke it in Settings → Claude if it leaks.
- Tokens can only be created from a signed-in browser session (`POST /auth/mcp-tokens` answers 403 `COOKIE_SESSION_REQUIRED` to a bearer token), so a leaked token can't make more.
- Lifetime: 30 days sliding (each day of use extends it). Unlike other sessions there is no 90-day cap. A password reset or Revoke ends the token at once.
- Text people wrote (descriptions, comments, notification snippets, standup updates, blockers and replies, feedback bodies, previews and notes) comes back fenced in `<user_content>`, and the server's instructions tell Claude to treat it as data, not instructions. Feedback comes from the public form, so anyone on the internet can write it: its body is always fenced and its title is kept to one line.
- Feedback submitters' contact details (email, phone, device, user agent) are never returned by any tool.
- stdout carries only the protocol; logs go to stderr and never include the token. Plain `http://` to anything but localhost logs a warning because the token would travel unencrypted.

<sub>[↑ Back to contents](#contents)</sub>

## Development

```bash
pnpm --filter @kite/mcp test        # vitest: resolvers + every tool through an in-memory MCP client
pnpm --filter @kite/mcp typecheck
KITE_URL=http://localhost:5173 KITE_TOKEN=… pnpm --filter @kite/mcp dev   # run from source (tsx)
pnpm --filter @kite/mcp pack:mcpb   # → apps/mcp/dist/kite-tasks.mcpb
```

| File                    | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`          | Entry: reads config, connects the stdio transport                               |
| `src/config.ts`         | `KITE_URL` / `KITE_TOKEN` / `KITE_WORKSPACE` validation                         |
| `src/kite.ts`           | API client (shared `createApiClient`), workspace choice, 60 s lookup cache      |
| `src/resolve.ts`        | Project / status / person / date / key / subtask / group / ref resolution       |
| `src/format.ts`         | Text output and the `<user_content>` fence                                      |
| `src/tooling.ts`        | What tool files share: argument schemas, annotations, error messages, lookups   |
| `src/tools.ts`          | The task tools; registers the files below                                       |
| `src/tools-subtasks.ts` | `add_subtask`, `complete_subtask`                                               |
| `src/tools-standups.ts` | `standup_today`, `post_standup`                                                 |
| `src/tools-feedback.ts` | `list_feedback`, `get_feedback`, `link_feedback_to_task`                        |
| `src/server.ts`         | `McpServer` with its instructions                                               |
| `mcpb/manifest.json`    | The extension's manifest (v0.2); its `version` is filled in from `package.json` |
| `scripts/pack-mcpb.mjs` | Builds, stages, validates and packs `dist/kite-tasks.mcpb`                      |

`@kite/shared` ships TypeScript source, so tsup bundles everything (shared, the SDK, zod) into one `dist/index.js`. Rebuild after pulling changes to the shared schemas.

**The extension.** `pack:mcpb` runs tsup, stages `manifest.json`, `server/index.mjs` (the bundle; `.mjs` because it is ESM and no `package.json` sits beside it) and `icon.png` (the web's 512px icon) in `.mcpb-stage/`, then `mcpb validate` and `mcpb pack` (`@anthropic-ai/mcpb`, pinned). The web image (`apps/web/Dockerfile`) runs it and serves the result at `/downloads/kite-tasks.mcpb`; Settings → Claude shows the download only when that URL answers with something other than the SPA's HTML. Bump `version` in `package.json` when the tools change, so people can tell an old install from a new one. Adding or renaming a tool also means updating the manifest's `tools`; `test/manifest.test.ts` fails until they match. In the extension, a blank optional setting can reach the server as the literal `${user_config.…}`; `readConfig` treats that as unset.

<sub>[↑ Back to contents](#contents)</sub>

## Troubleshooting

| Symptom                                                | Fix                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| "Kite rejected the token"                              | Revoked, expired (30 days unused) or reset password: create a new token, update `KITE_TOKEN`, restart Claude Desktop. |
| "Could not reach Kite at KITE_URL"                     | Server down, wrong URL, or a missing sub-path in `KITE_URL`.                                                          |
| "answered in a format this server does not understand" | The Kite server is newer than this build: `git pull && pnpm --filter @kite/mcp build`, restart Claude Desktop.        |
| "You are in several workspaces"                        | Set `KITE_WORKSPACE`, or name the workspace in your request.                                                          |
| Server not listed in Claude Desktop                    | Check `~/Library/Logs/Claude/mcp*.log` (macOS); usually a wrong path or `node` not on `PATH`.                         |

<sub>[↑ Back to contents](#contents)</sub>

## Known limitations

- No auto-update: after a Kite update, download and open the extension again.
- The extension isn't signed.
- No sprints or tags tools yet. Subtasks can be added and checked off, not renamed, reassigned or reordered.
- Standups: your own update only. No reactions, replies, resolving blockers, live meetings or past days.
- Feedback: no status changes, notes, unlinking or creating a task from a report (create the task, then link it).
- Changes show up in Kite as made by you; nothing marks them as "via Claude".

<sub>[↑ Back to contents](#contents)</sub>
