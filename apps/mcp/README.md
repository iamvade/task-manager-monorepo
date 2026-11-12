# Kite MCP server (`@kite/mcp`)

Last updated: 2026-11-12 11:45 AM CST

An [MCP](https://modelcontextprotocol.io) server that lets **Claude** read your Kite tasks and make everyday changes **as you**. It calls the normal Kite REST API (`/api/v1`) with your token, so access checks, activity history, notifications and realtime updates work exactly as in the web app. The same 19 tools run in two ways:

- **Remote connector** (`dist/http.js`): a Kite server that has it turned on gives one address (`<Kite address>/mcp`). You add it in Claude and sign in with your Kite account. Works in Claude on the web, the desktop app and the phone apps; nothing to install.
- **Claude Desktop extension** (`dist/index.js`, stdio): `kite-tasks.mcpb` from Settings → Claude, installed with a double-click and a pasted token. For servers without the connector, or Kite on a private network that Claude's servers can't reach.

## Contents

- [Connect with the remote connector](#connect-with-the-remote-connector)
- [Install the extension](#install-the-extension)
- [Setup from a checkout (developers)](#setup-from-a-checkout-developers)
- [Tools](#tools)
- [How it resolves names](#how-it-resolves-names)
- [Security](#security)
- [Running the remote connector](#running-the-remote-connector)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Connect with the remote connector

1. In Kite, open **Settings → Claude** and copy the **Connector address** (it ends in `/mcp`). If the page shows no address, this server doesn't run the connector: use the extension below.
2. In Claude (web or desktop app): **Customize → Connectors → Add custom connector**, paste the address and add it. Leave the OAuth option on "Use Claude's published identity".
3. Claude opens Kite: sign in if asked, check the account shown, and choose **Allow**.
4. Ask Claude something like "what's on my plate today in Kite?" Once connected it is also available in the Claude app on your phone.

Settings → Claude lists what is connected, with **Disconnect**. A sign-in lasts while it is used and ends after 30 days without use, on Disconnect, or when your password is reset. On Team and Enterprise plans an Owner adds the connector for the organization first.

<sub>[↑ Back to contents](#contents)</sub>

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
- **Remote connector.** Only allow-listed apps can ask for access (Claude's published client identity; there is no client registration), a code is only ever sent to that app's pinned callback, PKCE is required, and you are asked every time. Access tokens last one hour and are never extended; the refresh token is replaced on every use, and a replayed code or an old refresh token ends the sign-in. The endpoint accepts only tokens issued for its own address: an extension token or a browser session is refused with 401. Kite's MCP endpoint and REST API are one resource server (same deployment and issuer), so the endpoint uses your token on the API; it is never sent anywhere else. The platform admin account cannot be connected.
- stdout carries only the protocol; logs go to stderr and never include the token. Plain `http://` to anything but localhost logs a warning because the token would travel unencrypted.

<sub>[↑ Back to contents](#contents)</sub>

## Running the remote connector

The connector is two parts of one deployment: the API's OAuth routes (`CONNECTOR_ENABLED=true`, `apps/api/src/oauth/`) and this package's HTTP server. In production both come from `docker-compose.prod.yml` with `COMPOSE_PROFILES=connector`; see [docs/DEPLOY.md](../../docs/DEPLOY.md#claude-connector-optional).

| Variable                     |                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KITE_PUBLIC_URL` (required) | The address people open Kite at, with any sub-path. Tokens are issued for `<this>/mcp`, and links in answers start with it.                                                                 |
| `KITE_API_URL`               | How to reach the API from here (`http://api:3000` in the compose file). Defaults to the public address.                                                                                     |
| `PORT`, `HOST`               | Default `3001` and `127.0.0.1` (the image sets `0.0.0.0`).                                                                                                                                  |
| `MCP_ALLOWED_ORIGINS`        | Extra browser origins, comma separated. Requests without an `Origin`, from Kite's own origin, `https://claude.ai` and `https://claude.com` are always accepted; a refused origin is logged. |

How it behaves:

- `POST /mcp` only (Streamable HTTP, JSON responses). **Stateless**: a new server and transport per request, no session id, nothing shared between people. `GET` and `DELETE` answer 405. `GET /health` for the container health check.
- Without a valid token it answers `401` with `WWW-Authenticate: Bearer resource_metadata="<address>/api/v1/oauth/resource-metadata"`, which is how Claude finds where to sign in. When the API is down it answers `503`, not `401`, so Claude doesn't drop the sign-in.
- Protocol versions: up to **2025-11-25** (the pinned SDK's latest and the newest Claude documents). The 2026-07-28 revision is not supported yet.
- The web server must route `<address>/mcp` here and the OAuth metadata paths (`/.well-known/oauth-protected-resource…`, `/.well-known/oauth-authorization-server…`, `/.well-known/openid-configuration…`) to the API; `docker/caddy/Caddyfile` does, and under a sub-path the outer nginx needs the host-root locations in `docker/nginx/kite-subpath.conf`.

Locally:

```bash
# API with CONNECTOR_ENABLED=true (apps/api/.env), then:
KITE_PUBLIC_URL=http://localhost:5173 KITE_API_URL=http://127.0.0.1:3000 pnpm --filter @kite/mcp dev:http
pnpm --filter @kite/web dev      # proxies /mcp and the metadata paths like Caddy
```

`scripts/oauth-e2e.mjs` runs the whole flow as a scripted client (discovery, sign-in and Allow through the API, PKCE code exchange, tools, replay, refresh rotation, revoke). It needs the test client in the API's `OAUTH_EXTRA_CLIENTS` (the script's header has the value) and must never be pointed at production:

```bash
KITE_URL=http://localhost:5173 node apps/mcp/scripts/oauth-e2e.mjs
```

To try it in Claude itself the address must be public HTTPS (Claude connects from Anthropic's servers), e.g. a tunnel to the web dev server, with the API's `WEB_ORIGIN` and `KITE_PUBLIC_URL` set to the tunnel address.

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

| Symptom                                                | Fix                                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Kite rejected the token"                              | Revoked, expired (30 days unused) or reset password: create a new token, update `KITE_TOKEN`, restart Claude Desktop.                                                                                                            |
| "Could not reach Kite at KITE_URL"                     | Server down, wrong URL, or a missing sub-path in `KITE_URL`.                                                                                                                                                                     |
| "answered in a format this server does not understand" | The Kite server is newer than this build: `git pull && pnpm --filter @kite/mcp build`, restart Claude Desktop.                                                                                                                   |
| "You are in several workspaces"                        | Set `KITE_WORKSPACE`, or name the workspace in your request.                                                                                                                                                                     |
| Server not listed in Claude Desktop                    | Check `~/Library/Logs/Claude/mcp*.log` (macOS); usually a wrong path or `node` not on `PATH`.                                                                                                                                    |
| Connector: Claude can't connect or sign-in never opens | The address must be public HTTPS reachable over IPv4. `curl -i -X POST <address>/mcp` must answer `401` with `WWW-Authenticate`, and the `resource_metadata` URL in it must answer JSON (HTML means the proxy isn't routing it). |
| Connector: "This app isn't allowed to connect to Kite" | The app isn't on the server's allow-list (only Claude's published identity; in Claude keep "Use Claude's published identity").                                                                                                   |
| Connector: "Kite no longer accepts this sign-in"       | Disconnected, 30 days unused, or a password reset: reconnect in Claude (Customize → Connectors).                                                                                                                                 |
| Connector: requests answer `403 Origin not allowed`    | The server log names the origin; add it to `MCP_ALLOWED_ORIGINS` if it is legitimate.                                                                                                                                            |

<sub>[↑ Back to contents](#contents)</sub>

## Known limitations

- Remote connector: only Claude's apps (web, desktop, phone) can connect; other MCP clients, Claude Code included, are not on the allow-list. MCP protocol 2026-07-28 is not supported yet.
- Extension: no auto-update: after a Kite update, download and open the extension again.
- The extension isn't signed.
- No sprints or tags tools yet. Subtasks can be added and checked off, not renamed, reassigned or reordered.
- Standups: your own update only. No reactions, replies, resolving blockers, live meetings or past days.
- Feedback: no status changes, notes, unlinking or creating a task from a report (create the task, then link it).
- Changes show up in Kite as made by you; nothing marks them as "via Claude".

<sub>[↑ Back to contents](#contents)</sub>
