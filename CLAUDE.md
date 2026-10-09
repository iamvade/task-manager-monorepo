# Kite Tasks — project spec

A team task manager (spaces → projects → tasks) with List, Board and Calendar views, a task detail drawer, My Tasks home, Inbox, and a quick-create modal. Built for a team of 5–30 people. UI is bilingual: **Mongolian (default) and English**.

The visual source of truth is the `design/` folder (exported from Claude Design). These `.dc.html` files do not render standalone (they depend on a missing `support.js`), so **read them as source**: the inline styles give exact colors, sizes, spacing and states, and the `<script data-dc-script>` block at the bottom of each file holds the sample data, string tables (mn/en) and interaction logic. Match them closely. When a design and this spec disagree on a **visual** value (color, size, spacing, radius, shadow, typography), the design wins: use the design's value and update this file to match. For anything non-visual (behavior, data model, stack, API), ask. `docs/design-notes.md` has per-screen notes, decisions, and the full palette extracted from the designs.

| Design file | Screen |
|---|---|
| `design/Main.dc.html` | App shell (sidebar, top bar) + project **List view**, language switcher, mn/en strings |
| `design/ListDark.dc.html` | List view in **dark mode** (dark palette reference) |
| `design/Board.dc.html` | **Board (Kanban)** view, incl. drag state and drop placeholder |
| `design/TaskDetail.dc.html` | **Task detail drawer** over the list |
| `design/MyTasks.dc.html` | **My Tasks** home (greeting, stats, week chart, sections, activity feed) |
| `design/Calendar.dc.html` | **Calendar** (month/week, project filter, unscheduled panel) at space level |
| `design/CreateTask.dc.html` | **Quick create modal** with assignee/due/project pickers + keyboard hints |
| `design/EmptyProject.dc.html` | Empty project state + **templates** |
| `design/EmptyInbox.dc.html` | **Inbox** empty state + inbox tabs |

## Stack

- **Monorepo:** pnpm workspaces. `apps/web`, `apps/api`, `packages/shared`.
- **Frontend (`apps/web`):** Vite, React 18, TypeScript (strict), React Router, TanStack Query (server state), Zustand (UI state only), Tailwind CSS v4 driven by CSS variables (design tokens), dnd-kit (drag and drop), TipTap (rich text + @mentions), date-fns, i18next (mn/en), lucide-react icons, cmdk (⌘K palette).
- **Backend (`apps/api`):** Node 20+, Fastify 5, TypeScript (strict), Drizzle ORM + drizzle-kit migrations, PostgreSQL 16, zod via `fastify-type-provider-zod`, argon2 password hashing, cookie sessions, `@fastify/websocket` for realtime, `@fastify/multipart` for uploads, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/cors`, `@fastify/swagger` + `@fastify/swagger-ui` (OpenAPI 3.1 generated from the zod route schemas, Swagger UI at `/api/docs`, off in production unless `API_DOCS=true`), pino logging.
- **Shared (`packages/shared`):** zod schemas, DTO types, enums, event names — imported by both apps. Never duplicate a type across apps.
- **Dev infra:** `docker-compose.yml` with Postgres 16. Local file storage in `apps/api/uploads` behind a `Storage` interface (S3 later).
- **Testing:** Vitest everywhere; API integration tests with `app.inject()` against a real test database; Playwright for a few end-to-end flows.

## Conventions

- TypeScript strict, no `any`. ESLint + Prettier. Small files, feature folders.
- API: REST, JSON, prefix `/api/v1`. Validate every input with zod schemas from `packages/shared`. Errors are `{ error: { code, message } }` with proper HTTP status.
- OpenAPI: every route's `schema` declares `tags` (one of the tags in `apps/api/src/docs.ts`), a `summary`, a `description` when behavior isn't obvious (role limits, 409 codes), and response schemas for success and error statuses. Public routes set `security: []`. Shared request/response schemas get `.meta({ id: 'Name' })` so they appear as named models. `test/docs.test.ts` fails if an operation lacks a tag or summary.
- Every query is scoped by the caller's workspace membership. Never trust IDs from the client without checking access.
- Auth: cookie `kite_session` (random 32-byte token; `sessions.id` stores its SHA-256), 30-day sliding expiry. Protected routes use `preHandler: app.authenticate`, then `requireWorkspaceMember(request, workspaceId, minRole?)` or `loadProjectAccess(request, projectId, minRole?)` from `apps/api/src/auth/access.ts`. A resource in a workspace the caller isn't a member of answers **404** (never confirm it exists); 403 only for a member below the required role.
- CSRF: every POST/PUT/PATCH/DELETE must carry `Origin: WEB_ORIGIN` (rejected with 403 `CSRF_REJECTED` otherwise). API tests send it via `ORIGIN` from `test/fixtures.ts`.
- IDs are UUIDv7 (time-sortable). Timestamps are `timestamptz`. Due/start dates are `date` (no time).
- Ordering inside lists/columns uses fractional index strings (`fractional-indexing` package) in a `position` column (`text COLLATE "C"`, so keys sort byte-wise), so moving a card updates one row. Moves send the neighbors after the drop (`prevId`/`nextId`); the server places the item right after `prevId` (or right before `nextId`). Task positions are unique per status (`tasks_status_id_position_unique`), allocated under the project row lock and never reused (soft-deleted tasks keep theirs, so restore puts a task back in place).
- Every task mutation writes an `activity` row in the same transaction, then emits a realtime event after commit: use `mutateTasks` (`apps/api/src/tasks/mutation.ts`), which locks the project row, inserts the logged activity rows and emits on the `app.events` bus (`apps/api/src/events/bus.ts`) only after commit. Payload shapes: `activityPayloadSchemas` in `packages/shared`. Exceptions (event only, no activity row): a pure reorder (move within the same status, `task.moved`); subtask edits other than adding (`subtask.added`) and checking off (`subtask.completed`), i.e. rename, reassign, due, uncheck, reorder, delete (`subtask.changed`); comment edits and deletes; follow/unfollow (no event either). No-op edits write nothing.
- Frontend: all server data through TanStack Query hooks in `src/api/`. Mutations are optimistic for checkbox toggles, drag moves, and status/priority changes, with rollback on error.
- All UI strings through i18next (`mn.json`, `en.json`). Mongolian is the default. Take Mongolian copy from the `STR.mn` tables in the design files. Mongolian dates look like `10-р сарын 14`; English like `Oct 14`.
- Default timezone `Asia/Ulaanbaatar` (per-user override). "Today", "Tomorrow", "Overdue" are computed in the user's timezone.
- Accessibility: keep the aria-labels, focus-visible outlines (2px accent, 1px offset; accent-ink in dark) and keyboard support shown in the designs.
- Commit after each completed phase with a clear message.

## Data model (PostgreSQL)

- `users` — id, email (unique, citext), name, initials, avatar_color (palette key), password_hash, locale (`mn`|`en`), timezone, theme (`light`|`dark`|`system`), accent, density (`comfortable`|`compact`), notification_prefs (jsonb `{mention, assigned, comment, status}` booleans, default all true), created_at
- `sessions` — id (random token hash), user_id, expires_at, created_at
- `workspaces` — id, name, slug, created_at
- `workspace_members` — workspace_id, user_id, role (`owner`|`admin`|`member`), title (nullable job title shown as a role hint, e.g. "Eng lead"), joined_at
- `invites` — id, workspace_id, email, token_hash, role, expires_at, accepted_at
- `spaces` — id, workspace_id, name, initial, color (palette key), position
- `projects` — id, workspace_id (denormalized from the space, so `key` can be unique per workspace; composite FK `(space_id, workspace_id)` → spaces keeps it consistent), space_id, name, key (e.g. `APP`, unique per workspace), color (palette key), task_seq (int), position, archived_at, created_at. Every workspace member can see and edit every project.
- `project_members` — project_id, user_id (the project's team: header avatar stack, suggested assignees and @mentions; not an access boundary)
- `favorites` — user_id, project_id
- `statuses` — id, project_id, name (nullable: null = default status, the UI shows the translated name for its category), category (`todo`|`in_progress`|`review`|`done`), color (nullable: null = the category's color), position. New projects get 4 defaults (name null): To Do / In Progress / In Review / Done.
- `sprints` — id, project_id, name, start_date, end_date
- `tasks` — id, project_id, number (unique per project → shown as `APP-142`), status_id, sprint_id?, title, description (jsonb, TipTap doc), description_text (for search), priority (`urgent`|`high`|`medium`|`low`|`none`), start_date?, due_date?, position, created_by, completed_at?, created_at, updated_at, deleted_at?
- `task_assignees` — task_id, user_id
- `tags` — id, workspace_id, name, color (palette key); `task_tags` — task_id, tag_id
- `subtasks` — id, task_id, title, assignee_id?, due_date?, done, position
- `comments` — id, task_id, author_id, parent_id? (replies), body (jsonb), body_text, created_at, edited_at, deleted_at
- `attachments` — id, task_id, uploader_id, filename, mime, size, storage_key, created_at
- `task_followers` — task_id, user_id (creator, assignees and commenters follow automatically)
- `activity` — id, workspace_id, project_id, task_id, actor_id, type, payload (jsonb), created_at. Types: `task.created`, `status.changed`, `priority.changed`, `assignee.added/removed`, `due.changed`, `attachment.added`, `subtask.completed`, `comment.added`, etc.
- `notifications` — id, user_id, type (`mention`|`assigned`|`comment`|`status`), task_id, actor_id, activity_id, read_at?, archived_at?, created_at
  Created by the notifier (`apps/api/src/notifications/`) from bus events: @mentions (comments, descriptions), new assignees, comments and status changes on followed tasks. Never for the actor or non-members. One per recipient per event: the highest type they have enabled in `notification_prefs` (mention > assigned > comment > status). An unread, unarchived one of the same type on the same task from the last 5 minutes is updated in place (latest actor/activity, `created_at` bumped). Snippets are read from the comment/description at query time. A daily in-process job archives notifications read more than 30 days ago.
- Indexes: tasks(project_id, status_id, position), unique tasks(status_id, position), tasks(due_date), task_assignees(user_id), notifications(user_id, read_at), pg_trgm GIN on tasks.title for search.
- Colors (`users.avatar_color`, `spaces.color`, `projects.color`, `tags.color`) are palette keys such as `violet`, `blue`, `neutral`. The frontend maps each key to exact light/dark values from the designs (`docs/design-notes.md` Appendix A).
- Online presence is ephemeral (kept in the WebSocket server's memory), not stored.
- Seed (`apps/api/src/db/seed/data.ts`) mirrors the designs; dates shift so Oct 8 2026 = today. Eight people: the seven in Main plus Bayarmaa T. (QA, `yellow`) from TaskDetail/Calendar. Where Calendar and My Tasks disagree about Anu's tasks, My Tasks wins (Calendar's past "AB" items are done, future ones reassigned).

## Design tokens (from the designs)

Font: **Geist** (Google Fonts), fallback `ui-sans-serif, system-ui, sans-serif`. **Geist Mono** 12px for task keys (`APP-142`) and inline code. Weights 400/500/600. Type scale: 11px (kbd, small badges), 12px (meta, chips, column headers, counts), 13px (secondary text, buttons, cells), 14px / 20px base, long-form text (descriptions, comments) 14px / 22px in `--text-body`, 18/24 (calendar period title), 20/28 (modal title, empty-state headings), 22/30 (drawer title), 24/32 (page heading), 28/32 (stat numbers). Headings 600; letter-spacing −0.01em at 20px and up.

Spacing on a 4/8px grid. Borders 1px.

Radius scale: 3px (kbd inside field chips), 4px (kbd, 16px space badges, inline code), 5px (18px space badges, language segment buttons), 6px (tag chips, small icon buttons, menu options, calendar pills, segment buttons), 7px (language segmented track), 8px (buttons, inputs, nav items, field chips, segmented tracks, week-view cards), 10px (cards: board cards, attachments, comments, subtask list, unscheduled/template cards; popovers; editor and composer), 12px (panels: board columns, stat cards, activity panel, calendar grid, unscheduled panel), 14px (modal, empty-state illustration card), full (pills, count badges, avatars).

Shadows (only these):
- `--shadow-segment` `0 1px 2px rgba(24,24,27,0.08)` — selected segmented-control button
- `--shadow-popover` `0 8px 24px rgba(24,24,27,0.12)` — status listbox, mention suggestions, menus
- `--shadow-popover-lg` `0 12px 32px rgba(24,24,27,0.14)` — quick-create pickers, calendar day popover
- `--shadow-drawer` `-12px 0 32px rgba(24,24,27,0.10)` — task drawer
- `--shadow-modal` `0 24px 64px rgba(24,24,27,0.20), 0 2px 6px rgba(24,24,27,0.06)` — quick-create modal
- `--shadow-drag` `0 2px 4px rgba(24,24,27,0.06), 0 16px 32px rgba(24,24,27,0.14)` — card being dragged
- `--ring-soft` `0 0 0 3px var(--accent-soft)` — focused editor / comment composer
- Scrims: drawer `rgba(24,24,27,0.28)`, modal `rgba(24,24,27,0.32)`.

Layout: sidebar 248px (min 220px), collapsible to a 56px icon rail. Top bar 56px + 40px view tabs. List rows 44px (comfortable) / 36px (compact). Task drawer 40% width, min 520px, from the right. Quick-create modal 600px wide, 112px from the top.

| Token | Light | Dark |
|---|---|---|
| `--bg` | #FFFFFF | #111113 |
| `--bg-sidebar` | #F7F7F8 | #161618 |
| `--bg-subtle` (row hover, table/calendar headers, popover footers) | #FAFAFB | #18181B |
| `--surface` (cards, popovers, drawer, modal) | #FFFFFF | #1F1F23 |
| `--control` (secondary buttons, inputs) | #FFFFFF | #18181B (sidebar search #1B1B1E) |
| `--surface-2` (ghost hover, segmented track, inline code) | #F4F4F5 | #26262B |
| `--hover` (ghost buttons; sidebar nav uses #EDEDF0) | #F4F4F5 | #1F1F23 |
| `--chip` (count badges, neutral chips, "+N") | #F1F1F3, fg #52525B | #232328, fg #B4B4BC |
| `--border` (layout lines, cards) | #E6E6EA | #26262B |
| `--border-control` (buttons, inputs, kbd, toolbar divider) | #E6E6EA | #2A2A30 |
| `--border-subtle` (row dividers, panel edges) | #EFEFF2 | #1F1F23 |
| `--border-strong` (card hover, dashed add buttons) | #D4D4D8 | — |
| `--text` | #18181B | #EDEDEF |
| `--text-body` (long-form) | #27272A | — |
| `--text-2` | #3F3F46 | #C9C9D1 |
| `--text-3` (icons, links, secondary meta) | #52525B | #B4B4BC |
| `--text-muted` | #6B6B74 (text) / #71717A (icons) | #8E8E98 |
| `--text-faint` | #A1A1AA | #5E5E68 |
| `--accent` | #6E56CF (user can pick #2F6FEB, #0F766E, #3F3F46) | same |
| `--accent-ink` (accent as text, ring, outline) | = accent | #B4A5FF / #93B4FF / #5EEAD4 / #D4D4D8 for the 4 accents |
| `--accent-soft` | accent at 10% (`accent + 1A`) | accent at 20% (`accent + 33`) |
| `--danger` | #C42B1C (overdue text), #DC2626 (urgent) | #F87171 |
| `--warning` | #B45309 (due today) | #FBBF24 |
| `--success` | #16A34A | #22C55E |

"—" = not drawn in the designs; derive when needed.

Status markers (12px, 2px ring), rendered by category: To Do = ring #A1A1AA (dark #71717A); In Progress = ring + left-half fill #D97706 (dark #F59E0B); In Review = ring accent + 20% accent fill (dark: ring accent-ink, fill accent-soft); Done = solid #16A34A (dark #22C55E). Status tints (activity pills, board column headers): To Do #F1F1F3/#3F3F46 (board header #EDEDF0), In Progress #FDF0DC/#92400E, In Review accent-soft/accent, Done #E3F4E8/#166534.
Priority flags: Urgent #DC2626 (dark #F87171), High #EA580C (#FB923C), Medium #CA8A04 (#FACC15) — filled; Low = outline #A1A1AA (#71717A).
Due tones: overdue #C42B1C 500 (Board 600 + "· Overdue"), today #B45309 500, soon #3F3F46, later #6B6B74, done #A1A1AA; dark #F87171 / #FBBF24 / #C9C9D1 / #8E8E98 / #5E5E68.
Tag chips (22px, radius 6, 12px/500): palette key → soft bg + dark fg, e.g. blue (Research) `#E8F1FD/#1D4ED8`, violet (UX/UI) `#F1EEFD/#5B45B8`, teal (Design system) `#E3F4F1/#0F766E`, neutral (Frontend/iOS/Android/Docs) `#F1F1F3/#3F3F46`, orange (Analytics) `#FDF1E1/#9A3412`, green (A11y) `#E6F4EA/#166534`, pink (Onboarding) `#FCEBF3/#9D174D`. Dark: tinted rgba bg + light fg, e.g. blue `rgba(59,130,246,0.16)/#93C5FD`, neutral `#232328/#C9C9D1`.
Avatar colors (palette keys): indigo `#E0E7FF/#3730A3`, green `#DCFCE7/#166534`, rose `#FFE4E6/#9F1239`, amber `#FEF3C7/#92400E`, sky `#E0F2FE/#075985`, purple `#F3E8FF/#6B21A8`, teal `#CCFBF1/#115E59`, yellow `#FEF9C3/#854D0E`; dark e.g. indigo `#312E81/#C7D2FE`.
Full light/dark tables for avatars, space badges, project colors and tags: `docs/design-notes.md` Appendix A.

## Routes (web)

- `/login`, `/invite/:token`
- `/` → redirect to `/my-tasks`
- `/my-tasks`, `/inbox`
- `/p/:projectId/list` · `/board` · `/calendar` (task drawer opens via `?task=APP-142`)
- `/s/:spaceId/list` · `/board` · `/calendar` (space-level views across all the space's projects; calendar has a project filter)
- `/t/:taskKey` (task as full page)
- `/settings` (profile, language, theme, accent, density, notifications, members)
- Global: ⌘K palette, `C` = new task modal, `G` then `I` = Inbox, `Esc` closes drawer/modal.
