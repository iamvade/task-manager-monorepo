# Build prompts for Claude Code

Paste these into Claude Code (terminal) one at a time, from the repo root. `CLAUDE.md` is loaded automatically, so the prompts can stay focused on each phase.

How to work through them:

- Start each phase in **plan mode** (Shift+Tab) so Claude proposes a plan first; approve, then let it build.
- Finish each phase with the app running and tests green, then **commit** and run `/clear` before the next prompt. That keeps context small and quality high.
- If something looks off versus the design, say exactly what: "row height is 48 not 44", "tag chip should use design/Main.dc.html colors".
- Phases 1–7 are backend-heavy, 8–17 are frontend. You can open the app in the browser after phase 9.

---

## Phase 0 — Read and plan (no code)

```
Read CLAUDE.md and every file in design/. Don't write any code yet.

Then give me:
1. A short summary of each of the 9 screens: what's on it, what is interactive, and which data it needs.
2. Anything in the designs that isn't covered by the data model in CLAUDE.md (fields, states, counts), and how you'd handle it.
3. A list of reusable UI components you see repeated across screens (e.g. Avatar, AvatarStack, StatusDot, PriorityFlag, TagChip, DueDate, SegmentedControl, Sidebar, TopBar, Popover picker), with their props.
4. Your questions for me before we start.

Save items 1–3 as docs/design-notes.md so later phases can refer to it.
```

## Phase 1 — Monorepo scaffold

```
Set up the monorepo described in CLAUDE.md.

- pnpm workspaces with apps/web, apps/api, packages/shared. Root scripts: dev (runs api + web together), build, lint, typecheck, test, db:generate, db:migrate, db:seed, db:reset.
- docker-compose.yml with Postgres 16 (port 5432, volume, healthcheck) plus a second database for tests.
- apps/api: Fastify 5 + TypeScript, tsx for dev, zod type provider, pino-pretty in dev, @fastify/helmet, @fastify/cors (web origin only, credentials true), @fastify/rate-limit, @fastify/cookie. Health route GET /api/v1/health that checks the DB. Config loaded and validated with zod from .env (provide .env.example).
- apps/web: Vite + React 18 + TypeScript strict, React Router, TanStack Query, Tailwind v4, i18next, lucide-react. Vite dev proxy /api → the API so cookies are same-origin.
- packages/shared: exports zod schemas and types; both apps import it.
- ESLint + Prettier shared config, strict tsconfig base, Vitest set up in all three packages with one passing sample test each.
- README with setup steps.

Done when: `docker compose up -d && pnpm install && pnpm dev` shows a blank web page that successfully calls /api/v1/health, and `pnpm typecheck && pnpm lint && pnpm test` pass.
```

## Phase 2 — Database schema, migrations, seed

```
Implement the full data model from CLAUDE.md with Drizzle ORM in apps/api/src/db/schema/ (one file per area), and generate the initial migration with drizzle-kit.

- Use UUIDv7 ids, timestamptz, citext for email, pg enums for priority / status category / role / notification type. Enable pg_trgm and add the indexes listed in CLAUDE.md.
- Unique constraints: (project_id, number) on tasks, project key unique per workspace, composite PKs on join tables.
- Foreign keys with sensible ON DELETE behavior (cascade for join tables, soft-delete for tasks/comments).

Then write a seed script (pnpm db:seed) that recreates exactly the sample data in the designs, so the running app looks like the mockups:
- Workspace "Kite Studio"; users Anu Bold (me, owner), Temuulen G., Sara K., Dorj E., Mia L., Oyuka N., Bat O. with the avatar color pairs from the designs. Password "password123" for all in dev.
- Spaces Product / Engineering / Design and their projects (App Redesign, Checkout v2, Q4 Roadmap, Partner Portal (empty), Platform migration, Mobile release 4.2, Bug triage, Design system, Brand refresh). App Redesign has key APP.
- The 16 App Redesign tasks from design/Main.dc.html with their statuses, assignees, priorities, tags, due dates, subtask counts and comment counts. "Checkout page — responsive layout" must be APP-142 with the description, subtasks, attachments (metadata only), comments and activity history from design/TaskDetail.dc.html.
- The My Tasks items from design/MyTasks.dc.html and the calendar items from design/Calendar.dc.html, assigned to the right projects.
- A sprint "Oct 6 – Oct 24" on App Redesign. Dates relative to "today" so overdue/today/tomorrow still look right whenever the seed runs (treat Oct 8 2026 in the designs as "today").
- Task, space and project names are user content and are not translated by the UI. Support SEED_LANG=mn|en: with mn, use the Mongolian versions from the [mn, en] pairs in design/Main.dc.html where they exist; otherwise use English.

Done when: `pnpm db:reset` (drop, migrate, seed) runs cleanly and a quick script prints the APP project's tasks grouped by status.
```

## Phase 3 — Authentication and workspace access

```
Add authentication to the API and a login screen to the web app.

API:
- POST /auth/login, POST /auth/logout, GET /auth/me (returns user + workspaces + preferences).
- Sessions: random 32-byte token in an httpOnly, Secure (in prod), SameSite=Lax cookie; store only a SHA-256 hash in the sessions table; 30-day sliding expiry.
- argon2id password hashing. Rate-limit login per IP and per email. Generic error message for bad credentials.
- An `authenticate` preHandler and a `requireWorkspaceMember(workspaceId)` helper; a `loadProjectAccess` helper that resolves project → space → workspace and checks membership. Use these on every later route.
- Invites: POST /workspaces/:id/invites (admin+), GET /invites/:token, POST /invites/:token/accept (creates the user with name + password). Log the invite link to the console in dev instead of sending email.
- CSRF: reject state-changing requests whose Origin header isn't the web origin.
- PATCH /me for name, locale, timezone, theme, accent, density.

Web:
- /login page in the same visual language as the designs (centered card, Geist, accent button, mn/en switcher). /invite/:token accept page.
- An AuthProvider using TanStack Query on /auth/me; protected routes redirect to /login.

Tests: login success/failure, session expiry, access denied to another workspace's project.
```

## Phase 4 — Workspace, spaces, projects API

```
Build the structural API (all under /api/v1, all access-checked, zod-validated, with shared schemas in packages/shared):

- GET /workspaces/:id/sidebar → spaces with their projects (ordered by position), favorites, my-tasks count, unread inbox count. One endpoint so the sidebar loads in one request.
- Spaces: create, rename, recolor, reorder, delete (only if empty).
- Projects: create (auto-generate a unique 2–4 letter key from the name, editable; create the 4 default statuses), get (with statuses, members, active sprint, task counts per status), update, archive, reorder, favorite/unfavorite.
- POST /projects/:id/from-template with templateId: "product-launch" (18 tasks across planning, build, go-live), "sprint-planning" (12 tasks for a two-week cycle), "bug-triage" (6 tasks, adds Severity tags S1–S4). Define templates as JSON in code. This powers design/EmptyProject.dc.html.
- Members: list workspace members, list/add/remove project members.
- Tags: list, create, update colors, delete for the workspace.
- Statuses: list per project (reorder/rename can come later).
- Sprints: list/create per project.

Integration tests for access control and the template endpoint.
```

## Phase 5 — Tasks API

```
Build the tasks API. This is the core, so be careful with transactions and ordering.

- GET /projects/:id/tasks with query filters: statusId[], assigneeId[] (including "unassigned"), tagId[], priority[], sprintId, dueFrom/dueTo, hasDueDate, q (trigram search on title), includeDone. Sort: position (default within status), dueDate, priority, createdAt. Returns tasks with assignees, tags, subtask done/total, comment count, attachment count, and the task key (e.g. APP-142). No N+1 queries: use joins/aggregates.
- GET /tasks/:key (e.g. APP-142) and GET /tasks/:id — full detail: description, subtasks, attachments, followers, sprint, creator, timestamps.
- POST /projects/:id/tasks — allocate number by incrementing projects.task_seq inside the transaction (SELECT ... FOR UPDATE); default status = first "todo" status; position at end of that status (or at top if requested).
- PATCH /tasks/:id — title, description (TipTap JSON; also store plain text), status, priority, start/due date, sprint. Setting a "done"-category status sets completed_at; leaving it clears it.
- POST /tasks/:id/move — { statusId, beforeId?, afterId? } computes a fractional position between neighbors. Used by Board drag-and-drop and list reorder.
- PUT /tasks/:id/assignees, PUT /tasks/:id/tags (replace sets), POST /tasks/:id/complete toggle (for list checkboxes: moves to/from the Done status).
- DELETE /tasks/:id (soft delete) and POST /tasks/:id/restore.
- GET /workspaces/:id/search?q= for the ⌘K palette: tasks by title/key, projects, people. Limit 20.

Every mutation writes an activity row in the same transaction with a payload that lets the UI render lines like "Dorj E. changed status from To Do to In Progress" and "Anu B. changed priority from High to Urgent". Create an internal event bus (emit after commit) that later phases use for notifications and realtime.

Tests: number allocation under concurrent creates, move ordering, filters, completed_at logic, activity rows written.
```

## Phase 6 — Subtasks, comments, attachments, activity

```
Build the task-detail sub-resources used by design/TaskDetail.dc.html:

- Subtasks: list, create, update (title, assignee, due, done), reorder, delete. Completing one writes a "subtask.completed" activity.
- Comments: list (threaded one level: replies via parent_id), create, edit (own only, sets edited_at), delete (own or admin, soft). Body is TipTap JSON; extract @mentions (user ids from mention nodes) and plain text on the server.
- Attachments: POST multipart upload (25 MB limit, block executables, store via a Storage interface with a local-disk implementation), GET download with access check and correct Content-Disposition, DELETE. Generate image thumbnails? Not yet; just return mime and size.
- GET /tasks/:id/activity?type=all|comments|history — merged, chronological feed of activity rows and comments with actor info, so the drawer's All / Comments / History tabs are one endpoint.
- Followers: auto-follow creator, assignees, commenters and mentioned users; POST/DELETE /tasks/:id/follow.

Tests for mention extraction, permissions on edit/delete, upload validation.
```

## Phase 7 — Notifications and Inbox API

```
Build notifications for the Inbox (design/EmptyInbox.dc.html shows tabs All / Mentions / Assigned to me / Archived).

- Subscribe to the event bus from phase 5: create notifications for (a) @mentions, (b) being added as assignee, (c) new comments on followed tasks, (d) status changes on followed tasks. Never notify the actor about their own action. Collapse duplicates for the same task within 5 minutes.
- GET /me/notifications?tab=all|mentions|assigned|archived with cursor pagination; includes task key/title, project, actor, a snippet.
- POST /me/notifications/:id/read, POST /me/notifications/read-all, POST /me/notifications/:id/archive.
- A daily job (simple setInterval in-process is fine for now) that archives read notifications older than 30 days, as the empty-state copy says.
- GET /me/home for My Tasks (design/MyTasks.dc.html): my open tasks grouped into Overdue / Today / This Week / Later (in my timezone), stats (due today, completed this week + delta vs last week, overdue count + "oldest is N days late"), completed-per-day for the last 7 days (the week bar chart), and recent activity on my tasks with unread flags.

Tests for grouping boundaries (timezone!) and notification fan-out.
```

## Phase 8 — Frontend foundation and app shell

```
Build the frontend foundation and the app shell from design/Main.dc.html (sidebar + top bar). Read docs/design-notes.md first.

- Design tokens as CSS variables in src/styles/tokens.css exactly as listed in CLAUDE.md, with light and dark themes (data-theme on <html>, "system" follows prefers-color-scheme). Map them into Tailwind v4's @theme so classes like bg-surface, text-muted, border-default work. Accent is a runtime variable set from the user's preference; derive --accent-soft from it.
- Load Geist from Google Fonts.
- i18next with mn (default) and en. Copy every string from the STR tables in the design files into locales/mn.json and locales/en.json. Date formatting helper: "Өнөөдөр"/"Today", "Маргааш"/"Tomorrow", "10-р сарын 14"/"Oct 14", plus overdue/today/soon/later color classes.
- Reusable components (match the designs pixel-for-pixel; put them in src/components/ui): Avatar, AvatarStack (+N), StatusDot (4 variants), PriorityFlag, TagChip, DueDate, Kbd, SegmentedControl, IconButton (ghost), Button (primary/secondary), Popover + searchable Picker (used for assignee/date/project/status), Checkbox (round task checkbox), Tooltip, EmptyState.
- Sidebar: workspace switcher (Kite Studio), search box with ⌘K hint, My Tasks with count, Inbox with unread badge, Spaces list with expand/collapse and projects (active project highlighted with accent-soft), + new space, language switcher (МН / EN segmented control), invite teammates, settings, my avatar with online dot. Collapsible to the icon rail shown in the design; remember state in localStorage.
- Top bar: breadcrumb (space badge › project), favorite star, member avatar stack, Share, project options menu, view switcher (List / Board / Calendar with icons, underline in accent), Filter, Sort, Group, active filter chip (e.g. "Sprint is Oct 6 – Oct 24" with remove ×), + New Task primary button.
- Routing per CLAUDE.md; view switcher changes the URL. Loading skeletons and an error boundary.
- A small typed API client (fetch wrapper with credentials, error parsing) and TanStack Query hooks per resource in src/api/.

Done when: logged in as Anu, the shell matches design/Main.dc.html with real sidebar data, language switching flips all strings, and switching theme to dark matches design/ListDark.dc.html colors.
```

## Phase 9 — List view

```
Build the project List view exactly like design/Main.dc.html (and ListDark.dc.html in dark mode).

- Tasks grouped by status with collapsible group headers (chevron rotate, status dot, label, count, "+ add task" button). Done is collapsed by default. Remember collapsed groups per project in localStorage.
- Columns: checkbox, task name (with subtask "3/5" and comment-count indicators), assignee (avatar + name), due date (colored by overdue/today/soon/later), priority (flag + label), tags (max 2 chips + "+N"), row "more" menu that appears on hover/focus. Row height from density preference (44/36).
- Clicking the checkbox completes the task optimistically (strike-through, moves to Done group). Clicking the row opens the task drawer (?task=APP-142).
- Inline "add task" row at the bottom of a group: type a title, Enter creates in that status, Esc cancels, focus stays for rapid entry.
- Inline edits from cells: click assignee/due/priority/tags to open the shared Picker popovers.
- Filter menu (status, assignee incl. me/unassigned, priority, tags, sprint, due range), Sort menu, Group by (status / assignee / priority / none). Filters live in the URL query string so links are shareable; show active filters as removable chips.
- Drag to reorder within a group and move between groups (dnd-kit), calling /tasks/:id/move.
- Keyboard: j/k to move selection, Enter to open, x to toggle complete.
- Empty project shows design/EmptyProject.dc.html: illustration area, headline "<Project> has no tasks yet", "+ New task" button, and the three template cards calling the from-template endpoint.

Done when it matches the design side by side with seed data, and toggling/creating/reordering persists after refresh.
```

## Phase 10 — Task detail drawer

```
Build the task detail drawer from design/TaskDetail.dc.html. Opens from the right (about 40% width, min 560px) over the current view when ?task=KEY is in the URL; Esc or the close button removes the param. "Open as full page" goes to /t/KEY with the same component in a page layout.

Header: breadcrumb (space › project › APP-142), copy-link button (copies URL, shows a toast), more actions menu (duplicate, move to project, delete with undo toast), close.

Body:
- Editable title (contenteditable-style input, saves on blur/Enter).
- "Created by Anu B. on Oct 1 · Updated 2 hours ago" meta line.
- Properties grid: Status (popover with the 4 statuses and check mark), Assignees (avatars + add), Due date (with "Started Oct 4" start date), Priority, Tags (+ add), Sprint/Project.
- Description: TipTap editor with the toolbar from the design (bold, italic, strikethrough, inline code, link, bullet list, numbered list), markdown shortcuts, @mention suggestions of project members. Autosave with debounce and a subtle "Saved" indicator.
- Subtasks: progress bar (accent, turns green at 100%), "5/6" count, rows with checkbox, text, assignee avatar, optional due date; add subtask inline; drag to reorder.
- Attachments: file cards (icon/thumbnail, name, size · uploader), upload button and drag-and-drop onto the drawer, download on click, delete in menu.
- Activity: All / Comments / History segmented tabs. History lines render bold names and status pills exactly like the design; comments show avatar, name, time, body with mention chips, "1 reply" threads that expand, edit/delete for own comments.
- Comment composer pinned at the bottom: TipTap with @mention, ⌘↵ to send, optimistic append.

Every change updates the list/board caches so the background view stays in sync.
```

## Phase 11 — Board view

```
Build the Board view from design/Board.dc.html.

- One column per status: colored status dot, label, count, column menu, "+ Add task" at the bottom. Header shows "16 tasks · 4 done".
- Cards: title (strike-through when done), up to 2 tag chips + "+N", subtask progress "2/5" with mini icon, due date (red when overdue), priority flag, assignee avatars. Click opens the drawer.
- Drag and drop with dnd-kit: the dragged card is lifted with rotate(2.5deg) and a shadow, the original spot shows the dashed ghost at 40% opacity, and the target column shows the "Drop to move to <status>" placeholder exactly as in the design. Keyboard drag support (dnd-kit sensors) for accessibility.
- On drop: optimistic move, POST /tasks/:id/move with neighbors, rollback with an error toast on failure.
- Same filters as the List view (shared filter state from the URL). Horizontal scroll if columns overflow; columns scroll vertically independently.
```

## Phase 12 — Quick create modal, ⌘K, shortcuts

```
Build the quick create modal from design/CreateTask.dc.html and global keyboard shortcuts.

- Opens with "+ New Task", the "C" key (when not typing), or from a group's add button (pre-fills status). Centered modal over a dimmed background.
- Fields: title (autofocus), description (TipTap, placeholder "Add a description… Markdown and @mentions work here"), and pill buttons for Assignee, Due date, Project, plus "More fields" (priority, tags, status).
- Pickers are searchable popovers with full keyboard support: ↑↓ navigate, ↵ select, ⌫ unassign, Esc close. Assignee picker shows "Unassigned" + people with role hints (e.g. "Eng lead"). Due picker shows Today, Tomorrow, This weekend, Next week, In two weeks, No due date, plus a text input that parses natural language ("next fri") with chrono-node for English and simple Mongolian keywords (өнөөдөр, маргааш, дараа долоо хоног). Project picker grouped by space.
- Footer: Cancel, "Create and open" (opens the drawer), Create (⌘↵). Keyboard hints row as in the design.
- ⌘K command palette (cmdk): search tasks by title or key, projects, people; actions like "New task", "Go to My Tasks", "Switch theme", "Switch language".
- Shortcuts help dialog on "?".
```

## Phase 13 — My Tasks home

```
Build /my-tasks from design/MyTasks.dc.html using GET /me/home.

- Greeting "Good morning, Anu" (time-of-day aware, translated) and the date "Thursday, October 8".
- Stat cards: Due today, Completed this week with "+3 vs last week" delta, Overdue with "oldest is 2 days late". Mini bar chart of completions over the last 7 days (simple SVG, accent bars, today highlighted).
- Sections Overdue (red label, hint "Reschedule or close these first"), Today, This Week (with date range hint), Later. Collapsible, counts of open tasks. Each row: checkbox, title, space badge + project name, due date, priority. Completing optimistically updates the stat cards.
- Right panel "Recent activity": unread dot, actor, action, quoted comment snippet when relevant, time; "Show older activity" pagination; "View inbox" link.
```

## Phase 14 — Calendar view

```
Build the Calendar from design/Calendar.dc.html, used at /s/:spaceId/calendar (all projects in the space with a project filter) and /p/:projectId/calendar.

- Header: "Today" button, prev/next arrows, month/year label, Month / Week segmented control, project filter pills with each project's color (toggle visibility), "All projects".
- Month grid (weeks start Monday, Mongolian weekday names in mn): tasks as colored pills by project (strike-through when done), max 2–3 visible per day then "+3 more" which opens a popover listing all. Today's date highlighted with accent.
- Week view: 7 columns with all pills stacked.
- Right panel "Unscheduled": tasks with no due date, filter input, add button; empty state "Everything is scheduled."
- Drag a pill to another day to change its due date; drag from Unscheduled onto a day to schedule; drag a pill onto the Unscheduled panel to clear the date. Show the drop-target highlight like the design. Optimistic updates.
- Click a pill to open the task drawer.
```

## Phase 15 — Inbox, settings, polish

```
1. Inbox at /inbox: tabs All / Mentions / Assigned to me / Archived, notification rows (unread dot, actor avatar, "Sara K. mentioned you in APP-142", snippet, time), click marks read and opens the task drawer, hover actions (mark read, archive), "Mark all as read". Empty state exactly like design/EmptyInbox.dc.html including "View 24 archived notifications" with the real count. Sidebar unread badge stays in sync.
2. /settings: profile (name, initials color), language, timezone, theme (light/dark/system), accent color (the 4 swatches from the designs), density (comfortable/compact), workspace members list with invite form and role change (admins only).
3. Polish pass: compare every screen with its design file in both languages and both themes; fix spacing, colors, truncation of long Mongolian strings (they run longer than English — make sure nothing overflows), focus states, and hover states. Add toasts for errors and undo actions. List anything you couldn't match.
```

## Phase 16 — Realtime

```
Add realtime updates so teammates see changes without refreshing.

- API: a WebSocket endpoint /api/v1/ws authenticated by the session cookie. Clients subscribe to their workspace. On every event-bus event after commit, broadcast a small typed message (defined in packages/shared): task.created/updated/moved/deleted, comment.created, subtask.changed, notification.created (to that user only). Include the actor id and the minimal changed data.
- Keep it single-instance for now, but put the broadcaster behind an interface and note in the README how to switch to Postgres LISTEN/NOTIFY or Redis if we run several API instances.
- Web: one WebSocket connection with auto-reconnect and backoff. On messages, patch TanStack Query caches (or invalidate the affected queries) for list, board, calendar, drawer, my-tasks and inbox. Ignore echoes of my own optimistic changes. Show a subtle "Reconnecting…" indicator when disconnected and refetch on reconnect.
- Presence (optional, small): show who else is viewing the same task in the drawer header.

Test it with two browsers logged in as different users.
```

## Phase 17 — Testing and hardening

```
Hardening pass before real use.

- Make sure API integration tests cover every route's happy path and access-denied path. Add tests for the trickiest logic: task numbering, move positions, timezone grouping, mention notifications.
- Playwright e2e (against a seeded test DB): log in, create a task via the modal, drag it on the board to In Review, open the drawer, add a comment mentioning Sara, log in as Sara and see the inbox notification, then switch language to English and check a few labels.
- Security review: authorization on every route, input validation, upload restrictions, rate limits, cookie flags, CORS/origin checks, no secrets in logs, SQL only via Drizzle parameters. Fix anything you find and list it.
- Performance: check the tasks list query plan with EXPLAIN on 10k seeded tasks; add indexes if needed. Make sure the web bundle is code-split per route.
- Accessibility: run axe on each screen and fix issues.
```

## Phase 18 — Deployment

```
Prepare production deployment.

- Dockerfiles: API (multi-stage, node:20-slim, runs migrations on start via a separate command) and web (build with Vite, serve static files with Caddy or nginx, which also reverse-proxies /api and the WebSocket to the API so everything is same-origin).
- docker-compose.prod.yml: postgres (with volume + daily pg_dump backup container), api, web/caddy with automatic HTTPS for a domain from env.
- Production config: Secure cookies, trust proxy, log level, upload storage path on a volume (or S3 implementation of the Storage interface behind an env switch).
- A first-run command that creates the workspace and owner account instead of the dev seed.
- docs/DEPLOY.md with step-by-step instructions for a single Linux VPS, plus how to update and restore a backup.
```
