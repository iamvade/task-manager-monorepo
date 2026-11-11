# Kite MCP server (`@kite/mcp`)

Last updated: 2026-11-11 05:54 AM CST

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

| Tool              | Kind  | What it does                                                          |
| ----------------- | ----- | --------------------------------------------------------------------- |
| `list_workspaces` | read  | Who I am, my workspaces and roles                                     |
| `my_tasks`        | read  | My Tasks: Overdue / Today / This week / Later, plus tasks I requested |
| `search`          | read  | Tasks, projects, people and comments (like ⌘K)                        |
| `get_task`        | read  | One task: fields, description, subtasks, comments, link               |
| `list_projects`   | read  | Spaces and open projects                                              |
| `list_tasks`      | read  | A project's tasks, filtered by status, assignee or text (≤ 100)       |
| `list_members`    | read  | People: name, email, role, title, out of office                       |
| `inbox`           | read  | Latest notifications                                                  |
| `create_task`     | write | New task: status, priority, assignees, due date, description          |
| `update_task`     | write | Title, description, status, priority, due date, assignees             |
| `complete_task`   | write | Mark done or reopen                                                   |
| `add_comment`     | write | Comment, optionally @mentioning people                                |

Read tools carry `readOnlyHint`, so Claude Desktop can treat them differently from writes. Nothing deletes, archives, or changes settings or membership.

<sub>[↑ Back to contents](#contents)</sub>

## How it resolves names

`src/resolve.ts` turns words into ids and **never guesses**: when nothing matches, or several things do, the tool fails with the list of choices.

- **Projects**: by key (`APP`, any case) or exact name.
- **Statuses**: by the project's own name, the default names in English or Mongolian ("In Review", "Хийгдэж буй"), or a category (`todo`, `in_progress`, `review`, `on_hold`, `done`, `cancelled`).
- **People**: `me`, an email, a full name, a first name, or the start of a name, matched across scripts ("Bat" finds "Бат", see `nameSearchKey`). Deactivated members never match.
- **Dates**: `YYYY-MM-DD` only, a real calendar day; `null` clears.

<sub>[↑ Back to contents](#contents)</sub>

## Security

- **The token is your whole account.** The server only limits _which_ actions Claude can take. The API sees the token as you, so anyone holding it could do anything you can. Keep it out of shared files and revoke it in Settings → Claude if it leaks.
- Tokens can only be created from a signed-in browser session (`POST /auth/mcp-tokens` answers 403 `COOKIE_SESSION_REQUIRED` to a bearer token), so a leaked token can't make more.
- Lifetime: 30 days sliding (each day of use extends it). Unlike other sessions there is no 90-day cap. A password reset or Revoke ends the token at once.
- Text people wrote (descriptions, comments, notification snippets) comes back fenced in `<user_content>`, and the server's instructions tell Claude to treat it as data, not instructions. Feedback can come from the public form, so this matters.
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
| `src/resolve.ts`        | Project / status / person / date / key resolution                               |
| `src/format.ts`         | Text output and the `<user_content>` fence                                      |
| `src/tools.ts`          | The twelve tools and error messages                                             |
| `src/server.ts`         | `McpServer` with its instructions                                               |
| `mcpb/manifest.json`    | The extension's manifest (v0.3); its `version` is filled in from `package.json` |
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
- No sprints, tags, subtasks, standups or feedback tools yet.
- Changes show up in Kite as made by you; nothing marks them as "via Claude".

<sub>[↑ Back to contents](#contents)</sub>
