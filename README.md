# Kite Tasks

Team task manager (spaces → projects → tasks) with List, Board and Calendar views and team Reports. Mongolian (default) and English UI. See `CLAUDE.md` for the full spec and `docs/design-notes.md` for the design reference.

## Layout

| Path              | What                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | Vite + React 18 SPA (React Router, TanStack Query, Tailwind v4, i18next) |
| `apps/api`        | Fastify 5 REST API (`/api/v1`), Drizzle ORM, PostgreSQL 16, OpenAPI docs |
| `packages/shared` | zod schemas, DTO types and enums used by both apps                       |
| `design/`         | Design exports (read as source; they don't render standalone)            |

## Requirements

- Node.js 22.12+
- pnpm 12 (`corepack enable` picks up the version pinned in `package.json`)
- Docker (for Postgres)

## Setup

```sh
# 1. Environment files
cp .env.example .env                    # docker compose: POSTGRES_PORT
cp apps/api/.env.example apps/api/.env  # API config

# 2. Postgres 16 (creates databases `kite`, `kite_test` and `kite_e2e`)
docker compose up -d

# 3. Dependencies
pnpm install

# 4. Database schema + one owner account (pnpm db:reset:demo for the sample data)
pnpm db:reset

# 5. Run API (http://127.0.0.1:3000) and web (http://localhost:5173) together
pnpm dev
```

The web dev server proxies `/api` to the API, so the browser sees one origin and session cookies just work.

**Port 5432 already taken** (e.g. a local Postgres)? Set `POSTGRES_PORT=5433` in `.env` and use port `5433` in both URLs in `apps/api/.env`.

## API docs

With `pnpm dev` running, open **http://localhost:5173/api/docs** for Swagger UI. The OpenAPI 3.1 spec is at `/api/docs/json`. It is generated from the routes' zod schemas (shared with the web app via `packages/shared`), so it never drifts from what the API validates.

To try requests from the UI:

1. Run `POST /auth/login` with `{ "email": "anu@kite.test", "password": "password123" }`. The browser stores the `kite_session` cookie and sends it with every later request.
2. Call anything else, e.g. `GET /auth/me` for your workspace ID, then `GET /workspaces/{workspaceId}/sidebar`.

Use the web dev server URL (`:5173`), not the API directly (`:3000`): mutations must carry `Origin: WEB_ORIGIN` (CSRF check), which the browser only sends when the docs are served from the web origin.

Docs are on by default everywhere except `NODE_ENV=production`. Set `API_DOCS=true` or `false` in `apps/api/.env` to override.

## Reports

`/reports` has four tabs. Every member of the workspace sees **Overview**, **Sprints** and **Workload**. Admins and owners also get **People**, which shows any member's report. Members get **My performance**, which shows only their own report. Opening the other role's tab redirects to the right one.

| Tab                     | What                                                                                                               | Filters                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Overview                | Completed, cycle time, on-time, overdue; 12-week throughput; where work waits; aging tasks                         | period, space, project |
| Sprints                 | One project's sprint: committed / added / completed / carried over, last 6 sprints, burndown                       | sprint, space, project |
| Workload                | Open points per person by due bucket, against each person's capacity; reassign in place                            | space, project         |
| People / My performance | One person's cards against the previous period, 12-week trends against the team median, helping others, open tasks | period                 |

- **API.** `GET /api/v1/workspaces/:id/reports/overview | sprints | workload | people/:userId`. `people/me` is an alias for the caller. Each report also has a `.csv` variant ("Export CSV" / "Export my data"), UTF-8 with a BOM and headers in the caller's language. The OpenAPI tag is "Reports".
- **People access.** Only admins and owners can open `people/:userId` for someone else. A member asking for another person gets 403.
- **Freshness.**
  - Reports are computed live in SQL.
  - Each API process caches a computed report for 5 minutes (`REPORTS_CACHE_TTL_MS`, 0 turns it off). Any task change in the workspace drops that workspace's cached reports.
  - The web page refetches every 5 minutes, on window focus, and at most every 10 seconds when teammates change tasks.
- **Empty state.** A scope with fewer than 5 completed tasks shows "Reports appear after your team completes a few tasks" instead of charts.
- **Tools.**
  - `pnpm db:waits [KEY]` prints a project's median days per status.
  - `pnpm db:perf` builds a 10k-task workspace and times every endpoint uncached.

The metric definitions are in `CLAUDE.md` under "Reports".

## Standups

`/standup` holds async daily standups per **standup group**. A group is a team with its own days, post-by time, reminder and an optional meeting time. Every workspace member sees the groups. Only a group's members read and write its updates.

- **Groups.**
  - Admins and owners create groups.
  - Admins, owners and the group's one facilitator edit the settings and members (`/standup/:groupId/settings`).
  - Above 12 people, the group page and settings suggest splitting the group.
- **Writing.** "Write update" (`?write=1`) prefills Yesterday from your own activity since the previous standup day: the five strongest rows, with the rest behind "Show N more". Today offers chips for your overdue, due-today and in-progress tasks. Blockers take a linked task and the people who can help.
  - Drafts autosave.
  - Under 640px the same link opens a full-screen phone page.
  - Updates can be edited until the day ends in the group's time zone.
- **Reading.** The group page shows:
  - who has posted, is late or out of office;
  - open blockers first, including earlier days' blockers until someone resolves them;
  - reactions and replies.
    Past days are read-only, except that replies, reactions and resolving still work. A linked task shows "Blocked" in List, Board and the drawer.
- **Live meeting** (`/standup/:groupId/:date/live`, desktop, only when the group has a meeting time). The facilitator presses **Start standup**. If the group has no facilitator, or the facilitator is out that day, admins and owners in the group can start it. Then:
  - The meeting goes through people in the group's speaking order: posting order, alphabetical or random. People out of office are listed but skipped.
  - Previous / Next or ← → move between people. Each person has a timer, and the total runs against the meeting length; both turn warm when over time, with no sounds.
  - "Create task" on a Today item or blocker opens quick create prefilled with the title, the speaker as assignee, and a link back to the standup.
  - Notes autosave. **Save notes to standup** puts the notes and the created tasks on that day's page as "Meeting notes".
  - Everyone else in the group who opens the page (**Join live**) follows the facilitator's screen read-only. The live state lives on the server (`standup_meetings`), so reloads and late joiners agree.
- **Notifications.**
  - A reminder goes out between the reminder time and post-by to people who haven't posted. While a group waits for your update, the Inbox also pins a "write your update" row.
  - The facilitator gets a digest after post-by.
  - People named as helpers are notified, as are authors whose blockers get resolved or replied to. One Settings switch, "Standups", covers all of these.
- **Privacy rule.** Standup content and timing are never used in Reports or in any performance metric. That covers posts, blockers, replies, reactions, posting times, the late marker, meeting notes and per-person speaking times. No report, export, Workload or People view reads the standup tables.

The API is under the OpenAPI tag "Standups". Design notes are in `docs/design-notes.md` §5. Rules and endpoints are in `CLAUDE.md` under "Standups". A field test of a full standup morning is in `docs/review/STANDUP.md`.

## Realtime

Each browser tab opens one WebSocket, `GET /api/v1/ws?client=<tab id>`. The socket is authenticated by the session cookie, and its `Origin` must be `WEB_ORIGIN`. The tab subscribes to its workspace. After every committed change the API pushes a small typed message, defined by `realtimeServerMessageSchema` in `packages/shared`. A message carries only ids, the actor and the minimal changed data, and the web app patches or refetches the affected TanStack Query caches. The tab sends the same id as `X-Kite-Client` on its requests, so it never receives its own changes back. Presence (who is online, who is viewing which task) is kept only in the API's memory.

Flow: the event bus (after commit) → `toRealtime` → `Broadcaster.publish` → `RealtimeHub` delivers to this instance's sockets (`apps/api/src/realtime/`).

**Several API instances.** Today `LocalBroadcaster` delivers in-process, which is only correct for a single instance. To scale out, implement the `Broadcaster` interface (`publish`, `subscribe`, `close`) over a shared channel and pass it to the hub in `realtime/plugin.ts`. Nothing else changes:

- **Postgres `LISTEN/NOTIFY`** needs no new infrastructure. `publish` runs `SELECT pg_notify('kite_realtime', <envelope JSON>)`. Each instance holds one dedicated `pg.Client` (not a pool connection) that runs `LISTEN kite_realtime` and hands every notification to its subscribers. Payloads must stay under 8000 bytes, which is fine because messages are ids only. Reconnect the listener and refetch-on-reconnect covers the gap.
- **Redis pub/sub** (`ioredis`): `publish` sends to a `kite:realtime` channel, and a separate subscriber connection feeds the hub. Pick this if Redis is already around or the message volume grows.
- **Presence** has to become shared too. One option is to publish presence deltas over the same channel and have each instance merge them. The other is to keep per-user connection counts in Redis (`HINCRBY` plus TTL heartbeats, so a crashed instance's users expire) and build the `ready` snapshot from there.
- The load balancer must allow WebSocket upgrades and an idle timeout above the 25 s heartbeat. Sticky sessions are not required.

## Production

Docker Compose on one server: Caddy (automatic HTTPS, serves the SPA and proxies `/api` and the WebSocket), the API, Postgres 16 and a nightly `pg_dump` backup. Attachments on a volume or in an S3-compatible bucket (`STORAGE_DRIVER=s3`). The first workspace and owner come from `init.js` instead of the demo seed. Step-by-step setup, updates and restores: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Scripts (run from the repo root)

| Script               | Does                                                           |
| -------------------- | -------------------------------------------------------------- |
| `pnpm dev`           | API (tsx watch) + web (Vite) in parallel                       |
| `pnpm build`         | Production builds of all packages                              |
| `pnpm typecheck`     | `tsc` in every package                                         |
| `pnpm lint`          | ESLint over the repo                                           |
| `pnpm format`        | Prettier write                                                 |
| `pnpm test`          | Vitest in every package (API tests need `docker compose up`)   |
| `pnpm e2e`           | Playwright end-to-end tests (see below)                        |
| `pnpm db:generate`   | Generate a migration from `apps/api/src/db/schema`             |
| `pnpm db:migrate`    | Apply migrations                                               |
| `pnpm db:init`       | Create the first workspace + owner on an empty database        |
| `pnpm db:seed`       | Insert the sample data from the designs                        |
| `pnpm db:reset`      | Drop everything, migrate, create one owner (refuses in prod)   |
| `pnpm db:reset:demo` | Drop everything, migrate, insert the sample data               |
| `pnpm db:print`      | Print a project's tasks by status (`pnpm db:print CHK`)        |
| `pnpm db:scenario`   | Add a realistic test workspace (`small` or `large`, see below) |

### Sample data

`db:reset` leaves an empty workspace **Shoppy** with one owner, `lkhagvadorj.b@shoppy.mn` / `password123` (`apps/api/src/db/seed/blank.ts`).

`db:seed` / `db:reset:demo` recreate the workspace from the designs: **Kite Studio**, eight people (log in as `anu@kite.test`, everyone's password is `password123`), the Product / Engineering / Design spaces with their projects, App Redesign's tasks (APP-142 is the task from the detail drawer), Anu's My Tasks and the October calendar. Design dates are shifted so that Oct 8 2026 is today.

- `SEED_LANG=mn|en` (default `mn`): language of task, project, space, tag and people names that the designs have in both languages.
- `SEED_TODAY=2026-10-08`: pin "today" for an exact match with the mockups (weekday-based views such as My Tasks' _This Week_ only match on a Thursday).

### Scenario data

`pnpm db:scenario small|large` adds a realistic workspace next to the design seed (re-running replaces it, `--drop` removes it, refuses in production). Dates are relative to today (`SEED_TODAY` pins it); everyone's password is `password123`, and the command prints a login for each role and situation.

- **small** — "Nomad Labs" (`@nomadlabs.test`): 7 people, 2 spaces, 4 projects, ~300 tasks over 3 months. A busy lead, a designer who mostly comments, an overloaded developer, someone on vacation with tasks still assigned, a new joiner from last week.
- **large** — "Altai Group" (`@altaigroup.test`, ~45 s): 120 people in 8 departments plus 9 who left (still assignees, one still a project lead), 10 spaces, 60 projects (5 archived, 4 with 1,000+ tasks), ~25k tasks over a year, 300+ tags, two-week sprints in the engineering spaces only. Mixed Mongolian/English names with shared first names (three Bat-Erdenes, two Sarangerels with the same short name, two Anus) and long Mongolian project and task names; a few people sit in 20+ projects.

Both have mostly small tasks, a few 50+ comment threads, tasks without an assignee or due date, and a pile of stale tasks nobody touches.

Both also have standups: about three working weeks of updates linked to people's real tasks, blockers (some still open, some with helpers), reactions, replies, past meetings with saved notes, and today partly posted with reminders. People on vacation are out of office.

- Nomad Labs has one group of all 7.
- Altai Group has three 8-person squads, a Product & design group, an async support group where a newcomer joined yesterday, and a 30-person "Engineering all-hands" to show what happens when a group is too big.

Code: `apps/api/src/db/scenario/` (standups in `standups.ts`).

API tests run against `TEST_DATABASE_URL` (the `kite_test` database); migrations are applied to it automatically before the suite.

### End-to-end tests

`pnpm e2e` runs Playwright (`apps/web/e2e/`, config `apps/web/playwright.config.ts`) against its own servers, so a running `pnpm dev` is left alone:

- The API runs on port 3100. Before it starts, `pnpm --filter @kite/api db:e2e` creates the `kite_e2e` database if it is missing, then resets it and seeds it with the English sample data.
- The web app runs on port 5273 and proxies `/api` to that API.
- The database URL is `E2E_DATABASE_URL`, or else the `DATABASE_URL` from `apps/api/.env` with the database name changed to `kite_e2e`. `db:e2e` refuses to touch any database whose name doesn't end in `_e2e`.

Install the browser once with `pnpm --filter @kite/web exec playwright install chromium`. The specs sign in through the login form as Anu (owner) and Dorj (member). They cover:

- Reassigning a Heavy person's task on Workload, then checking both bars.
- A member's access to Workload and the People → My performance redirect.
- The People person picker.
- Partner Portal's not-enough-history state.
- Writing a standup on a desktop and at 390×844 (autosaved draft, chips, a linked blocker that shows "Blocked" in List and Board), reacting and replying.
- A live meeting with two browsers: Bat drives, Anu follows; arrow keys, Create task from a blocker, notes, Save notes, End; then the day page's Meeting notes.
- axe on every screen and overlay (`a11y.spec.ts`), the skip link and the drawer's focus trap.
