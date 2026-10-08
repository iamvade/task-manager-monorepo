# Kite Tasks — project spec

A team task manager (spaces → projects → tasks) with List, Board and Calendar views, a task detail drawer, My Tasks home, Inbox, and a quick-create modal. Built for a team of 5–30 people. UI is bilingual: **Mongolian (default) and English**.

The visual source of truth is the `design/` folder (exported from Claude Design). These `.dc.html` files do not render standalone (they depend on a missing `support.js`), so **read them as source**: the inline styles give exact colors, sizes, spacing and states, and the `<script data-dc-script>` block at the bottom of each file holds the sample data, string tables (mn/en) and interaction logic. Match them closely. When a design and this spec disagree, ask.

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
- **Backend (`apps/api`):** Node 20+, Fastify 5, TypeScript (strict), Drizzle ORM + drizzle-kit migrations, PostgreSQL 16, zod via `fastify-type-provider-zod`, argon2 password hashing, cookie sessions, `@fastify/websocket` for realtime, `@fastify/multipart` for uploads, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/cors`, pino logging.
- **Shared (`packages/shared`):** zod schemas, DTO types, enums, event names — imported by both apps. Never duplicate a type across apps.
- **Dev infra:** `docker-compose.yml` with Postgres 16. Local file storage in `apps/api/uploads` behind a `Storage` interface (S3 later).
- **Testing:** Vitest everywhere; API integration tests with `app.inject()` against a real test database; Playwright for a few end-to-end flows.

## Conventions

- TypeScript strict, no `any`. ESLint + Prettier. Small files, feature folders.
- API: REST, JSON, prefix `/api/v1`. Validate every input with zod schemas from `packages/shared`. Errors are `{ error: { code, message } }` with proper HTTP status.
- Every query is scoped by the caller's workspace membership. Never trust IDs from the client without checking access.
- IDs are UUIDv7 (time-sortable). Timestamps are `timestamptz`. Due/start dates are `date` (no time).
- Ordering inside lists/columns uses fractional index strings (`fractional-indexing` package) in a `position` column, so moving a card updates one row.
- Every task mutation writes an `activity` row in the same transaction, then emits a realtime event after commit.
- Frontend: all server data through TanStack Query hooks in `src/api/`. Mutations are optimistic for checkbox toggles, drag moves, and status/priority changes, with rollback on error.
- All UI strings through i18next (`mn.json`, `en.json`). Mongolian is the default. Take Mongolian copy from the `STR.mn` tables in the design files. Mongolian dates look like `10-р сарын 14`; English like `Oct 14`.
- Default timezone `Asia/Ulaanbaatar` (per-user override). "Today", "Tomorrow", "Overdue" are computed in the user's timezone.
- Accessibility: keep the aria-labels, focus-visible outlines (2px accent, 1px offset) and keyboard support shown in the designs.
- Commit after each completed phase with a clear message.

## Data model (PostgreSQL)

- `users` — id, email (unique, citext), name, initials, avatar_color, password_hash, locale (`mn`|`en`), timezone, theme (`light`|`dark`|`system`), accent, density (`comfortable`|`compact`), created_at
- `sessions` — id (random token hash), user_id, expires_at, created_at
- `workspaces` — id, name, slug, created_at
- `workspace_members` — workspace_id, user_id, role (`owner`|`admin`|`member`), joined_at
- `invites` — id, workspace_id, email, token_hash, role, expires_at, accepted_at
- `spaces` — id, workspace_id, name, initial, color, position
- `projects` — id, space_id, name, key (e.g. `APP`, unique per workspace), color, task_seq (int), position, archived_at, created_at
- `project_members` — project_id, user_id
- `favorites` — user_id, project_id
- `statuses` — id, project_id, name, category (`todo`|`in_progress`|`review`|`done`), color, position. New projects get 4 defaults: To Do / In Progress / In Review / Done.
- `sprints` — id, project_id, name, start_date, end_date
- `tasks` — id, project_id, number (unique per project → shown as `APP-142`), status_id, sprint_id?, title, description (jsonb, TipTap doc), description_text (for search), priority (`urgent`|`high`|`medium`|`low`|`none`), start_date?, due_date?, position, created_by, completed_at?, created_at, updated_at, deleted_at?
- `task_assignees` — task_id, user_id
- `tags` — id, workspace_id, name, color_bg, color_fg; `task_tags` — task_id, tag_id
- `subtasks` — id, task_id, title, assignee_id?, due_date?, done, position
- `comments` — id, task_id, author_id, parent_id? (replies), body (jsonb), body_text, created_at, edited_at, deleted_at
- `attachments` — id, task_id, uploader_id, filename, mime, size, storage_key, created_at
- `task_followers` — task_id, user_id (creator, assignees and commenters follow automatically)
- `activity` — id, workspace_id, project_id, task_id, actor_id, type, payload (jsonb), created_at. Types: `task.created`, `status.changed`, `priority.changed`, `assignee.added/removed`, `due.changed`, `attachment.added`, `subtask.completed`, `comment.added`, etc.
- `notifications` — id, user_id, type (`mention`|`assigned`|`comment`|`status`), task_id, actor_id, activity_id, read_at?, archived_at?, created_at
- Indexes: tasks(project_id, status_id, position), tasks(due_date), task_assignees(user_id), notifications(user_id, read_at), pg_trgm GIN on tasks.title for search.

## Design tokens (from the designs)

Font: **Geist** (Google Fonts), fallback `ui-sans-serif, system-ui, sans-serif`. Base 14px / 20px line height. Small text 12–13px. Weights 400/500/600.

Spacing on a 4/8px grid. Radius 8px (controls, cards), 6px (small chips, avatars-in-squares), 4px (kbd). Borders 1px, no heavy shadows (only `0 1px 2px rgba(24,24,27,0.08)` on selected segmented controls).

Layout: sidebar 248px (min 220px), collapsible to an icon rail. List rows 44px (comfortable) / 36px (compact). Task drawer ≈40% width from the right.

| Token | Light | Dark |
|---|---|---|
| `--bg` | #FFFFFF | #111113 |
| `--bg-sidebar` | #F7F7F8 | #18181B |
| `--surface` | #FFFFFF | #1F1F23 |
| `--surface-2` | #F4F4F5 | #26262B |
| `--hover` | #EDEDF0 / row #FAFAFB | #26262B |
| `--border` | #E6E6EA | #2A2A30 |
| `--text` | #18181B | #EDEDEF |
| `--text-2` | #3F3F46 / #52525B | #C9C9D1 / #B4B4BC |
| `--text-muted` | #6B6B74 / #71717A | #8E8E98 |
| `--text-faint` | #A1A1AA | #5E5E68 |
| `--accent` | #6E56CF (user can pick #2F6FEB, #0F766E, #3F3F46) | same; accent text #B4A5FF |
| `--accent-soft` | accent at 10% alpha (`accent + 1A`) | accent at ~16% |
| `--danger` | #C42B1C (overdue text), #DC2626 | #F87171 |
| `--warning` | #B45309 (due today) | — |

Status markers: To Do = 2px ring #A1A1AA; In Progress = ring + half fill #D97706; In Review = ring accent + 20% accent fill; Done = solid #16A34A.
Priority flags: Urgent #DC2626, High #EA580C, Medium #CA8A04 (filled), Low = outline #A1A1AA.
Tag chips: soft bg + dark fg pairs, e.g. Research `#E8F1FD/#1D4ED8`, UX/UI `#F1EEFD/#5B45B8`, Design system `#E3F4F1/#0F766E`, Frontend/iOS/Android/Docs `#F1F1F3/#3F3F46`, Analytics `#FDF1E1/#9A3412`, A11y `#E6F4EA/#166534`, Onboarding `#FCEBF3/#9D174D`. Get dark-mode variants from `ListDark.dc.html`.
Avatar colors: pairs like `#E0E7FF/#3730A3`, `#DCFCE7/#166534`, `#FFE4E6/#9F1239`, `#FEF3C7/#92400E`, `#E0F2FE/#075985`, `#F3E8FF/#6B21A8`, `#CCFBF1/#115E59`.

## Routes (web)

- `/login`, `/invite/:token`
- `/` → redirect to `/my-tasks`
- `/my-tasks`, `/inbox`
- `/p/:projectId/list` · `/board` · `/calendar` (task drawer opens via `?task=APP-142`)
- `/s/:spaceId/calendar` (space-level calendar with project filter)
- `/t/:taskKey` (task as full page)
- `/settings` (profile, language, theme, accent, density, members)
- Global: ⌘K palette, `C` = new task modal, `Esc` closes drawer/modal.
