# Kite Tasks — mobile notes (Expo app, `apps/mobile`)

Planning notes for the iOS + Android app (`docs/MOBILE_PROMPTS.md` B0, 2026-10-26). Nothing here is built yet. Sources: every `design/Mobile*.dc.html` plus `StandupWriteMobile.dc.html`, checked against the API routes (`apps/api/src/routes/`), the shared schemas (`packages/shared/src/schemas/`) and the web app. Gaps marked **(v)** were verified in code.

How to read the mobile designs: each file is a 1840px board of 390×844 phone scenes (numbered 01, 02, …), often ending with a "Behaviour" rules card. The `<script data-dc-script>` block holds the sample data, the light/dark token values (`t.*`), the mn/en `STR` table and the scene logic. `Mobile*Dark.dc.html` files are 1 KB wrappers that render the same file with `theme="dark"`. Sample "today" is Thu Oct 8 2026, the user is Anu B. (owner), and the workspace is Kite Studio.

Already planned elsewhere, and only referenced here:
- ~~**B1:** bearer-token auth and WebSocket auth by header.~~ Done (2026-10-26): `client: "mobile"` on login / invite accept returns `session.token`; `Authorization: Bearer` on every route and the WebSocket; `GET|DELETE /auth/sessions` for signed-in devices. See CLAUDE.md Conventions "Auth" and "CSRF".
- **B11:** push devices and sending.
- **B14:** `DELETE /me`.
- **B15:** universal links.

---

## 0. Summary

### 0.1 Navigation
- **Tab bar:** My Tasks · Projects · Inbox (unread badge) · Standup (dot while my update is waiting) · More. Feedback, Reports, Settings and Search live under More; Search is also an icon in every large header.
- **Create:** a 56px FAB, not a tab. It shows on My Tasks, Projects and project screens, hides on scroll down and lifts above a toast. Inside a project it prefills that project.
- **Large-title header (tab roots):** workspace switcher (accent "K" tile + name + chevron), Search, and the account avatar with an online dot. It collapses to a 56px bar on scroll.
- **Pushed screens:** 56px header with back (an edge swipe also goes back), title + subtitle, and right-side actions.
- **Modal sheets:** Cancel / title / primary.
- **Pickers:** every picker is a bottom sheet with a grabber.

### 0.2 API gaps across screens (deduplicated; details per screen in §1)

**Needed for screens as drawn (no product decision required):**

| # | Gap | Where | Proposed fix |
|---|---|---|---|
| G1 | No open-task count per project or space **(v)** | Projects tab, space header, search project rows | `openCount` on `SidebarProject` (open = not closed, so On hold counts); space total summed on the client |
| G2 | `MyTask` lacks `subtaskProgress` and `commentCount` **(v)** | My Tasks rows | Add both (they are already on `TaskListItem`) |
| G3 | No "mark unread" for notifications **(v)** | Inbox swipe right | `POST /me/notifications/:id/unread` |
| G4 | Inbox `counts` holds only the workspace `unread` + `archived`; `read-all` takes no tab **(v)** | Inbox tab pills, "Mark all as read" | Per-tab unread counts; `read-all?tab=` |
| G5 | Standup group list has no `postedCount` / `expectedCount`, no waiting flag and no live-meeting flag **(v)** | Standup tab dot, group switcher, My Tasks standup card (N+1 day requests today) | Add a `today` summary per group to `GET /workspaces/:id/standup-groups` |
| G6 | Attachment downloads: no `Range`, no `ETag`, no thumbnails, no image width/height **(v)** | Image grid and viewer, feedback video (iOS AVPlayer needs byte ranges) | Range + ETag on both download routes; `width`/`height` on `Attachment`; thumbnails optional if the client downsizes before upload (see L9) |
| G7 | No endpoint lists `workspace_holidays` **(v)** | Out of office sheet ("Back Mon · 5 work days") | `GET /workspaces/:id/holidays?from&to` |
| G8 | "No sprint" can't be filtered: `sprintId` is a uuid **(v)** | Project filter sheet | `sprintId=none` |
| G9 | The web origin is not exposed **(v)** | Share/copy link (`/w/:slug/t/KEY`), meeting back-link in task descriptions | `webOrigin` (and the server version) in `GET /health`; also shown by the server check on sign-in |
| G10 | `/health` has no product name or version **(v)** | Sign-in "Change server" check | Same as G9 |
| G11 | Activity feed: no "involving me" filter and no total unread **(v)** | My Tasks → Recent activity | `GET /me/activity?involving=me`; `unreadCount` on the first page |
| G12 | Search: no per-group totals, no `scope`, people without a job title, projects without a count **(v)** | Search screen | `scope` + totals; title and space can be joined on the client |
| G13 | `TaskBlocked` has no post time and no helpers **(v)** | Task detail Blocked banner | Add `postedAt` and `helpers` (redacted for non-members like `text`) |
| G14 | `mentionedIn` has no comment author **(v)** | Task detail "Mentioned in" | Add `commentAuthor` |
| G15 | Create task has no idempotency key **(v)** | Offline queue ("3 changes synced") | `clientId` on create (unique per workspace), or never queue creates while offline |
| G16 | Comments can't carry attachments **(v)** | Composer paperclip | Upload to the task and link it in the comment, or drop the paperclip (Q) |

**Gaps that are really new features (decide first; see the questions in the B0 reply):**
- Forgot password: no reset flow and no email service.
- "N attempts left" on sign-in.
- Invite preview with the inviter and member avatars (needs an `invites.invited_by` column).
- Pending invites for my email.
- Workspace color and member count in the switcher.
- Ownership transfer.
- "Nudge now" for standups.
- Snoozing a standup reminder.
- Quiet hours + morning summary.
- "Due soon" and "review requested" notification types.
- @mentions in feedback notes.
- Feedback statuses Planned/Resolved and auto-resolve.
- Feedback device fields from an in-app SDK.
- A 30-day purge of deleted tasks: the copy promises it, but no job exists **(v)**.
- An "Away" presence state.
- Workload deltas, Unassigned and By status.
- Report periods "Last 30 days" and "This month".

### 0.3 Design vs spec conflicts
1. **Text in `faint`.** Done/cancelled titles and keys, and out-of-month days, use `faint` (2.6:1). CLAUDE.md requires `--text-muted`, so keep the spec.
2. **On hold and Cancelled markers are now drawn.**
   - On hold: red ring #DC2626 / #F87171 with pause bars. Web derived rose #E11D48.
   - Cancelled: grey ring #A1A1AA / #71717A with a ×. Web derived a solid fill with a cut-out cross.
   - By CLAUDE.md "design wins", this means updating web `tokens.css` and `StatusDot.tsx` too.
3. The Board has no Cancelled column, yet "Move to…" offers Cancelled. The web Board has the column.
4. Toast length is 4 s (8 s with an action). The web uses 5 s / 8 s.
5. Realtime "X just now" lasts 3 s as a tint plus 30 s as a pill on any row (Tags included). The web uses 10 s on status/assignees/due/priority/title (`RECENT_EDIT_MS`).
6. Undo after every Board drag (design) vs only for moves into Done (web).
7. Templates: the design shows Sprint planning, App release, Bug triage and User research. `TEMPLATE_IDS` is product-launch, sprint-planning and bug-triage **(v)**.
8. The avatar palette has pink; `AVATAR_COLORS` has yellow **(v)**.
9. The design says "Accent is per device"; it is per account (`users.accent`).
10. My performance colors deltas green/red. `.claude/rules/reports.md` says those deltas are neutral.
11. Standup post order:
    - Design: mine first, then newest first.
    - API and web: open blockers first, then oldest first.
12. The feedback status set:
    - Design: New / Reviewing / Planned / Resolved / Closed.
    - API: `new|review|linked|closed` **(v)**.
13. "Mentioned in" lists standups and "Docs". Standups write no `task_references` by rule, and Docs don't exist.
14. Danger button in dark: #DC2626 with white text (design) vs dark text on #F87171 (web).
15. Size hints:
    - Mobile: L "3–5 days", XL "1–2 weeks".
    - Web: L "3–4 days", XL "about a week, consider splitting".
16. Out-of-office avatar: the design uses chip #F1F1F3 with #A1A1AA initials. The web moved to #E4E4E7 for contrast; keep the web value.

---

## 1. Screens

### 1.1 Shell + auth — `MobileFoundations`, `MobileAuth`

#### Sign in (default · wrong password · locked · change server)
- **On screen:**
  - Brand row, title 28/34 and a subtitle (names the host when the server was changed).
  - Email and password fields, 48px; the password has an eye toggle.
  - Inline error: "Email or password is incorrect. N attempts left."
  - Lock alert with a "Try again in 4:59" countdown on a disabled button.
  - "Forgot password?" link.
  - "Change server" expands a URL field with a live check ("Found a Kite Tasks 4.2 server"). The button then reads "Back to Kite Cloud".
- **Interactive:** password reveal; live server check; countdown; email keyboard; autocomplete username/current-password.
- **Endpoints:**
  - `POST /auth/login`: 401 `INVALID_CREDENTIALS`, 429 `RATE_LIMITED` + `Retry-After`.
  - `GET /health` for the server check.
  - Native sign-in: `client: "mobile"` (B1, done).
- **Gaps:**
  - No remaining-attempts count **(v)**.
  - The copy says 5 min; the throttle window is 15 min. Use `Retry-After` **(v)**.
  - No password reset **(v)**.
  - `/health` has no name/version (G10).

#### Accept invite
- **On screen:** workspace name; "Invited by Anu B. · Owner"; 4 member avatars, "9 members · valid until Oct 15"; email (read-only); full name; password with a strength meter and the rule "8+ characters with a number or symbol"; Join; "Have an account? Sign in to join".
- **Endpoints:**
  - `GET /invites/:token` returns workspace, email, role, `expiresAt`, `accountExists`.
  - `POST /invites/:token/accept {name, password}`: 401 `LOGIN_REQUIRED`, 409 `ACCOUNT_EXISTS`.
- **Gaps:**
  - No inviter (no `invited_by` column) **(v)**.
  - No member count or avatars on the public route **(v)**. Exposing them is a privacy decision.
  - The "number or symbol" rule isn't enforced: `passwordSchema` is min 8 **(v)**. The meter is client-only.
  - Opening the link in the app needs B15.

#### No workspace yet
- **On screen:** illustration, the copy "…It will show up here as soon as it arrives.", an avatar + email chip, Check again, Sign out.
- **Endpoints:** `GET /auth/me`, `POST /auth/logout`.
- **Gaps:** no "pending invites for my email" and no push for it **(v)**. "Check again" only re-reads memberships, so the copy overpromises.

#### Workspace switcher sheet
- **On screen:**
  - 64px rows: colored tile, name, "Owner · 9 members", unread badge (9+) or a "new activity" dot, a check on the current one.
  - Legend line.
  - "Join with an invite link" and "Sign out of …".
- **Endpoints:** `GET /auth/me` (workspaces with role and title), `GET /me/notifications/unread-counts`.
- **Gaps:**
  - No member count, no workspace color, no activity dot **(v)**.
  - The "Guest" role doesn't exist **(v)**.
  - The "Anu's personal" workspace is illustrative: only the platform admin creates workspaces.

#### Notification priming (before the OS prompt)
- **On screen:** three lock-screen previews, "Know when it matters", reasons (Mentions, Assignments, Standup reminders), Turn on, Not now, "change later in More › Notifications".
- **Endpoints:** OS permission only; registration needs B11.
- **Gaps:**
  - "or its due date is close": there is no due-soon type **(v)**.
  - "15 minutes before your standup is due": reminders fire at each group's `reminder_at` **(v)**.

#### App frame states (Foundations 06)
- Offline banner under the header: "You're offline. Changes will sync when you reconnect.", then "Back online · 3 changes synced".
- Pull to refresh.
- Skeleton rows.
- Error state with "Try again".
- **Gaps:** an offline queue of creates needs G15.

### 1.2 My Tasks — `MobileMyTasks`

#### Home (01 normal · 02 completed + Undo · 05 all done, standup posted · 06 first run · 07 loading)
- **On screen:**
  - Large header with the date line "Пүрэв, 10-р сарын 8" and the greeting 28/34.
  - **Stat cards:** a sideways snap carousel, 112px tall.
    - "Due today": N, "N of M left · 1 urgent".
    - "Completed this week": N, "+N vs last week", 7 Mon–Sun bars.
    - "Overdue": N, "Oldest is 2 days late"; the card is red when above 0.
  - **Standup card:**
    - Not posted: "Due by 10:00 · 4 of 5 have posted", posted avatars plus a dashed "You", Write update / See team updates.
    - Posted: one line, "Standup posted · 09:32 · 5 of 5 · 2 replies".
  - **Recent activity card:** 3 actor avatars, the latest line, a "3 new" pill.
  - "All spaces" chip + "N open".
  - **Sections:** Overdue (red, hint "Close these first"), Today, Tomorrow, This week, Later, No date. Each is collapsible with a count.
  - **Rows:** marker in a 44px target, title in 2 lines, key · project · due chip (Overdue/This week/Later only) · subtasks · comments, priority, avatars.
  - FAB.
- **Interactive:**
  - Tap the marker or swipe right to complete. The row is struck through in place with Undo, and leaves the list only after leaving the screen or pulling to refresh.
  - Stat cards filter the list.
  - Section open state is kept on the device.
  - Overdue hides when empty. Today always shows ("Nothing due today · You finished 4 tasks").
  - The standup card shows only to group members.
  - First run: "Nothing assigned to you yet", Create your first task / Browse projects, no FAB.
- **Endpoints:**
  - `GET /me/home`: sections, stats, first 10 activity items.
  - `POST /tasks/:id/complete` (also reopens, which serves Undo).
  - `GET /workspaces/:id/standup-groups`, then `GET /standup-groups/:id/days/today` per waiting group.
  - `GET /workspaces/:id/sidebar`: Inbox badge.
- **Gaps:**
  - G2 (row fields); G5 (N+1 for the standup card).
  - The API's `thisWeek` is tomorrow → Sunday and `later` includes undated. The client splits Tomorrow and No date by `dueDate` **(v)**, so no API change.
  - "3 new" needs G11.
  - The phone drops the web's "Requested by me" section (`sections.requested`); intentional?

#### Space filter sheet (03)
- **On screen:** "All spaces" + each space badge with open count, a check, "remembered on this device".
- **Endpoints:** sidebar for spaces; counts from `MyTask.space` in `/me/home`.
- **Gaps:** stats can't be recomputed per space ("vs last week" needs history). There is no `spaceId` on `/me/home` **(v)**.

#### Recent activity (04)
- **On screen:** back, "Mark all as read", All / Involving me segments, groups Today / Yesterday / Earlier this week. Rows: 32px avatar, sentence, task title, status pill or quote, time · key, unread dot.
- **Endpoints:**
  - `/me/home` `activity`, then `GET /me/activity?cursor`.
  - `POST /me/notifications/read-all` (feed `unread` comes from notifications).
- **Gaps:**
  - G11.
  - Whether "Mark all as read" here should clear the whole Inbox.

### 1.3 Projects, List, Board — `MobileProjects`

Behaviour card rules:
- Favorites come first, then spaces.
- Group headers are sticky.
- Done and Cancelled start collapsed, and Cancelled is left out of totals.
- Long-press starts multi-select and swaps the tab bar for an action bar.
- Delete Undo lasts 8 s.
- Board shows one column per screen; holding a card at the screen edge for 0.5 s pages.
- Card ⋯ → "Move to…" is the non-drag and screen-reader path.

#### Projects tab (01)
- **On screen:**
  - Large title and a search field (client-side filter).
  - "★ Favorites": dot, name, `KEY · Space`, open count.
  - "Spaces": collapse chevron (44px), badge, name (opens the space list), "N projects"; nested projects with dot, name, open count or "Empty".
  - Footnote: archived projects aren't shown. FAB.
- **Endpoints:** `GET /workspaces/:id/sidebar`: spaces → projects, favorites, `inboxUnreadCount`, `feedbackUnreadCount`.
- **Gaps:** G1. Favorites carry `spaceId` only, so the space name is joined on the client.

#### Project List (02 sticky headers · 04 after deleting 3)
- **On screen:**
  - 56px header: back, name + `● APP · Product`, member stack, ⋯.
  - Segmented List / Board / Calendar (40px).
  - Chip row: Filter (with an active count), Sprint 14, Assignee, Priority, Tags, "Done: last 14 days".
  - "16 tasks · 4 done".
  - Sticky 44px group headers: chevron, marker, label, count, "+".
  - Rows ≥64px: marker target, 2-line title, key · due pill · Blocked pill · "3/5" · comments, flag, avatars.
- **Interactive:**
  - Collapse groups. Group "+" creates in that status.
  - Tapping the marker opens the status sheet.
  - Long-press selects. Chips open sheets.
  - The ⋯ menu and member button contents aren't drawn; mirror the web: favorite, notification level, archive, rename.
- **Endpoints:**
  - `GET /projects/:id`: statuses, members, `activeSprint`, `taskCounts`.
  - `GET /projects/:id/tasks?doneSince&sprintId&…`.
  - `POST /projects/:id/tasks {statusId}`.
  - `PATCH /tasks/:id {statusId}`.
- **Row fields:** all present on `TaskListItem` (`subtaskProgress`, `commentCount`, `blocked`) **(v)**.
- **Gaps:** none blocking.
  - "N tasks" leaves out Cancelled; derive it from `taskCounts` + categories **(v)**.
  - The list is unpaginated: fine at 5–30 people.

#### Multi-select (03)
- **On screen:** accent-soft header with Cancel / "3 selected" / Select all; 22px round checkboxes; selected rows tinted; FAB hidden; a 56px action bar with Status, Assignee, Due, Priority, Delete.
- **Endpoints:**
  - `POST /projects/:id/tasks/batch` (per-task values, max 200).
  - `…/batch-delete`, `…/batch-restore` for Undo.
- **Gaps:** batch calls are per project, so space-level multi-select would need one call per project (not drawn there).

#### Filter sheet (05)
- **On screen:**
  - Sprint (single: "Sprint 14 · current", "Sprint 15", "No sprint").
  - Assignee ("Me" first, multi), Priority (multi), Tags (multi).
  - Done tasks: Last 14 days / All / Hide.
  - Reset; footer "Show 9 tasks" with a live count.
- **Endpoints:**
  - `GET /workspaces/:id/sprints` (filter by `projectIds`), `GET …/tags`, project members.
  - `GET /projects/:id/tasks` with `assigneeId[]`, `priority[]`, `tagId[]`, `sprintId`, `includeDone=false` (Hide) or `doneSince`. All filters are server-side; sort is client-side.
- **Gaps:**
  - G8 ("No sprint").
  - "Show N" needs a preview query (run the filtered query before applying); no count endpoint, which is acceptable.

#### Board (06 page · 07 dragging at the edge · 08 paged · 09 Move to…)
- **On screen:**
  - Column pager pills (tablist, marker + count).
  - 342px column pages: tinted header with "+".
  - **Cards:** done check, 2-line title, ⋯, "Blocked · text" banner, up to 2 tags + "+N", key, due pill, a "2/5" bar, flag, avatars.
  - **Drag state:**
    - Ghost source card at 0.4 opacity.
    - Lifted card at 300px, rotated 3°, with an accent border and a heavy shadow.
    - A 64px edge zone with an arrow.
    - A 128px dashed "Drop to move to In Review".
  - **Move to… sheet:** all statuses, the current one checked, "Move to another project ›".
  - Columns: To Do → Done. **No Cancelled column.**
- **Interactive:** swipe to page; tap a pill to jump; long-press lifts; edge-hold pages; drop moves with Undo; "+" per column.
- **Endpoints:**
  - `POST /tasks/:id/move {statusId, prevId, nextId}`: neighbours in the target status, else 400 `INVALID_MOVE`. The sheet sends `{statusId}` only, which appends.
  - `POST /tasks/:id/move-to-project`.
- **Gaps:** none.

#### Space list (10)
- **On screen:** space badge + name, "4 projects · 28 open tasks", ⋯; chips Filter, Project, Assignee, Done; "Grouped by status · sorted by due date"; rows with a project pill. No Board or Calendar segments here.
- **Endpoints:** `GET /spaces/:id/tasks?projectId[]…`.
- **Gaps:**
  - G1 (subtitle total).
  - Which project the group "+" uses is undecided.

#### Empty project + templates (11)
- **On screen:** illustration, "This project is empty", Add task, Invite members, 4 template cards.
- **Endpoints:**
  - `POST /projects/:id/from-template {templateId}` (409 `PROJECT_NOT_EMPTY`).
  - Empty when `taskCount === 0`.
  - Invite is admin-only.
- **Gaps:**
  - The template set differs (conflict 7).
  - The catalog's display metadata is hard-coded in web `features/list/EmptyProject.tsx` **(v)**; move it to shared.
  - Hide "Invite members" for members.

### 1.4 Task detail — `MobileTaskDetail`

#### Detail (01–04 scrolled · 12 loading)
- **On screen:**
  - 56px header: back, "App Redesign › APP-142", Complete pill, share, ⋯.
  - Title 22/30, edits in place. Meta: "Created by Anu B. on Oct 1 · Updated 2 hours ago".
  - Blocked banner: text, "From Dorj E.'s standup · today 09:41 · Can help: Bat O.".
  - **Property rows** (52px, 128px label column): Status, Assignees, Due (+ "Started Oct 4"), Priority, Tags, Size ("L · 3–5 days"), Sprint, Reviewer (while in review), Followers ("You're following").
  - **Description** read view with Edit.
  - **Subtasks:** "5/6" with a bar; rows with a 22px checkbox, title, due chip, avatar; "+ Add subtask".
  - **Attachments:** 2-column grid; image tiles 104px high; file tiles with a type badge; dashed Add tile.
  - **Linked feedback:** type chip, title, "FB-1037 · Batzorig M. · Oct 5", "See all (4)".
  - **Mentioned in.**
  - **Activity:** All / Comments / History. Comment bubbles (radius 4/14/14/14), one level of replies, Reply.
  - **Composer** pinned at the bottom: paperclip + 44px pill.
- **Interactive:**
  - Every row opens its sheet.
  - A teammate's realtime change tints the row and shows "Sara · just now" (conflict 5).
  - The banner opens the standup day.
  - Subtask check and add.
  - Image → viewer; feedback → feedback detail; mention → source.
- **Endpoints:**
  - `GET /tasks/:ref?workspaceId=`, `PATCH /tasks/:id`.
  - `PUT /tasks/:id/assignees|tags`, `POST /tasks/:id/complete`.
  - Subtasks: `POST /tasks/:id/subtasks`, `PATCH /subtasks/:id`.
  - `GET /tasks/:id/activity`, `POST /tasks/:id/comments {parentId?}`.
  - Picker sources: members, project, tags, sprints.
  - Realtime `task.updated` `changes`.
- **Gaps:**
  - G13, G14, G6 (no dimensions).
  - Standup and "Doc" mentions (conflict 13).
  - The activity feed is unpaginated **(v)**: acceptable for now.

#### Description editing (05)
- Accent border plus a soft ring. A 48px toolbar above the keyboard, scrolling sideways: B, I, S, code, bullets, numbers, link, @. Done saves (`PATCH {description}`).
- No heading button; the web has h3/h4.

#### Comment with @ suggestions (06)
- The composer grows to 2 rows with attach, @ and a round send button.
- A "People" list floats above: 52px rows, 32px avatar, name, job title (or "Away until …"), max 6.
- Same source and matching as web: members, project team first, `filterMentions`.
- **Gaps:** G16.

#### Dates sheet (07)
- Start / Due tab cards; presets Today / Tomorrow / Next week / No date; a month grid with the range band (due filled, start ringed); "Clear start date".
- `PATCH {startDate, dueDate}`.

#### More actions (08)
- Header with key and title; Duplicate / Move to project / Unfollow / Delete (red); Cancel.
- Endpoints: `POST /duplicate`, `POST /move-to-project`, `DELETE|POST /follow`, `DELETE /tasks/:id` + `POST /restore` (Undo).

#### Add attachment (09) + image viewer (10)
- **Source sheet:** Camera / Photos / Files tiles; "Up to 25 MB per file. Photos are resized automatically."
- **Viewer:** black background; close and share; "1 / 2"; filename, size, uploader, date; dots; swipe, pinch and drag-to-close.
- **Endpoints:**
  - `POST /tasks/:id/attachments`: multipart, one part `file`. 413 `FILE_TOO_LARGE` / `STORAGE_QUOTA_EXCEEDED`, 415 `FILE_TYPE_BLOCKED`.
  - `GET /attachments/:id/download?inline=true` (bearer works since B1).
- **Gaps:**
  - No server resizing **(v)**: downscale on the client.
  - HEIC isn't inline-previewable on web (`canInline` covers png/jpeg/gif/webp) **(v)**: convert to JPEG before upload.
  - G6.

#### Deleted (11) and title conflict (13)
- **Deleted:**
  - Red strip "Deleted by Anu B. 2 minutes ago. It will be removed for good in 30 days." with Restore. The page is read-only and has no composer.
  - Deleted-by comes from the last `task.deleted` history row.
  - No purge job exists **(v)**, so the copy promises something false.
- **Title conflict:**
  - Amber alert "Dorj E. just changed the title to: …" with **Use theirs** and **Keep mine**.
  - Keep mine is new (the web has Use theirs only).
- **Not drawn:** not found / no access / offline / key moved to another workspace. Reuse the web behaviour (`useFoundInOtherWorkspace`).

#### Rich text a native renderer and editor must handle (`packages/shared/src/rich-text.ts`)
- **Nodes:** `doc`, `paragraph`, `text`, `heading` (the web emits 3–4; render any level), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `hardBreak`, `horizontalRule`, `mention {id, label}`.
- **Marks:** `bold`, `italic`, `strike`, `code`, `underline`, `link {href: http(s)|mailto}`.
- **Limits:** depth ≤ 40, ≤ 200 000 chars.
- **Task keys** (`KEY-123`) aren't nodes. Split text with `splitTaskKeys` (skip inside code and link marks) and render them as links.

### 1.5 Quick create — `MobileCreateTask` (01 default · 02 assignee · 03 due · 04 create more · 05 from My Tasks › Tomorrow · 06 from a Board column · 07 error · 08 discard)
- **On screen:**
  - A sheet on the keyboard: project chip › "New task" ×.
  - Optional "APP-143 created · Open" strip (4 s).
  - Title 20/28 and description 16px ("@mentions work here").
  - Sideways chips: [Status when from Board] · Assignee · Due · Project · Priority · Size · Tags · Sprint.
  - "Create more" switch; Create (48px).
- **Interactive:**
  - Opens with the keyboard up. Defaults to the last project used.
  - **A chip swaps the keyboard for its picker pane at the same height (336px)**; "Keyboard" swaps back.
  - Return moves from title to description.
  - Create with no title shows "Add a title" and refocuses.
  - Create more keeps the fields and clears title and description.
  - Dismissing with text asks "Discard this task?".
  - **Prefills:** from a My Tasks section → me + that date; from a Board column → that status; from a project → that project.
- **Endpoints:**
  - `POST /projects/:id/tasks` (title, description doc, statusId, priority, size, assigneeIds, tagIds, start/due, sprintId).
  - Picker sources: sidebar, project, members, tags, sprints.
- **Gaps:** none in the API.
  - The description is plain text, so convert it with `plainToRichText` + `resolveTypedMentions` (move that to shared, §3).
  - "Last project" is per device.

### 1.6 Inbox — `MobileInbox`

#### Inbox (01 All · 02 Mentions · 03 swipe · 04 all caught up · 05 archived empty)
- **On screen:**
  - Header: switcher, Mark all as read, a bell (→ settings). Large title.
  - Underline tabs All / Mentions / Assigned to me / Archived, each with an unread pill.
  - **Pinned reminder card:** "Post your Mobile team update · 13 min left until 10:00 · 4 of 5 have posted", Write update / "In 15 min".
  - Rows grouped Today / Yesterday:
    - People rows: 36px avatar, sentence, task title, status pill or quote (2 lines), time · project, unread dot.
    - System rows: digest, resolved, help.
- **Interactive:**
  - Tap → task or standup (marks read).
  - Swipe right → read/unread. Swipe left → archive with an 8 s Undo.
  - Mark all read applies to the current tab.
  - The pin stays until the post-by time or until I post.
  - Empty: "Go to My Tasks", "Notification settings", "View 24 archived".
- **Endpoints:**
  - `GET /me/notifications?tab=&cursor`.
  - `POST /me/notifications/:id/read|archive|unarchive`, `POST /me/notifications/read-all`.
  - The pinned card uses the groups + the day request.
- **Gaps:**
  - G3, G4.
  - The Mentions tab is `type = mention` only **(v)**. The design also files `standup_help` and `standup_reply` there.
  - Snooze has no endpoint or state **(v)**.
  - The digest's prose summary isn't in `standupDigestDataSchema` (counts only) **(v)**.
  - The pin rule differs from web `waitingForMe` (until the day ends).

#### Notification settings (06) + project level sheet (07)
- **On screen:**
  - A master "Push notifications · On this phone · Kite Studio" switch.
  - Five switches: Mentions / Assigned / Comments / Status changes / Standups.
  - Per-project levels (All / Direct only / None).
  - Quiet hours 22:00–08:00 + days, with a morning summary.
- **Endpoints:** `PATCH /me {notificationPrefs}`, `GET /workspaces/:id/notification-levels`, `PUT /projects/:id/notification-level`.
- **Gaps:**
  - The five prefs today decide whether a notification reaches the **Inbox**; the design puts them under the push switch **(v)**.
  - Design "Direct" includes "your task changes"; design "None" keeps the Inbox. Both conflict with the API **(v)**.
  - No due-soon or review-requested types **(v)**.
  - Quiet hours don't exist **(v)**.
  - The master switch needs B11.

#### Lock-screen pushes (08–11: copy for B11)
- **Mention:**
  - Title "Bat O. · APP-142" / "Бат О. · APP-142".
  - Body "Mentioned you: “…”" / "Таныг дурдлаа: «…»".
- **Standup reminder:**
  - Title "Standup · Mobile team".
  - Body "Post your update before 10:00. 4 of 5 have posted." The count is computed at send time.
- **Android actions:** Reply / Mark read on mentions; Write update on reminders.
- **Format:** quotes are «» in mn and “” in en. The body clamps to 3 lines on iOS and 2 on Android. The OS preview setting hides content.

### 1.7 Calendar — `MobileCalendar` (space level)

#### Month (01 · 02 filter off · 07 November)
- **On screen:**
  - Header: space badge + "Calendar", "No date · 5" pill.
  - Month / Week segments; project chips (dot + name; off = dashed and struck through).
  - Month title, Today, ‹ ›.
  - 7-column grid of 50px cells: up to 3 project-colored dots; today ringed; the selected day filled.
  - Agenda for the selected day: marker, 2-line title, key, project chip, flag, avatar.
- **Interactive:**
  - Tap a day; swipe or arrows change month.
  - Chips toggle (remembered on the device).
  - Done tasks are struck through at full color. Out-of-month days are tappable.
  - Empty day: "Nothing due this day" + "Add a task on this day" (asks for a project at space level).
- **Endpoints:**
  - `GET /spaces/:id/tasks?dueFrom&dueTo` for the visible range.
  - `?hasDueDate=false&includeDone=false` for the unscheduled count.
  - Sidebar for the chips; `POST /projects/:id/tasks {dueDate}`.
- **Gaps:** none **(v)**.
  - Only the space calendar is drawn. The project calendar works with `GET /projects/:id/tasks` and the same screen.

#### Week (03)
- "Oct 5 – 11"; sticky 48px day headers (today filled), single-line rows, "Nothing due".
- Same endpoints.

#### Unscheduled (04) + Set due date (05)
- **Unscheduled sheet:** rows with a dashed "Date" pill.
- **Set due date sheet:** 2×2 presets (Today, Tomorrow, Next week = Monday, In two weeks) + a month grid.
- `PATCH /tasks/:id {dueDate}` (optimistic).

#### Long-press move (06)
- The row lifts and the chip row becomes "Drop on a day · Oct 9". The target cell is accent-soft with a ring.
- Drop → `PATCH {dueDate}` + Undo.

### 1.8 Standup — `MobileStandup`, `StandupWriteMobile`

#### Group page (01 not posted · 02 posted, meeting live · 06 past day · 11 under the OOO sheet)
- **On screen:**
  - Header: group name 22/28 ⌄ (switcher), "▶ Start" pill, ⋯ (Out of office, Group settings).
  - Day bar: ‹, "Thursday, Oct 8", Today / "Go to today", ›.
  - Red live banner: "Standup is live · Bat is leading · 3 of 5 · 06:40" with Join.
  - Past-day note: "read-only. You can still reply."
  - **"Who has posted" card:** "4 of 5 posted · Due 10:00 · meeting 10:15"; a sideways strip of 44px avatars (posted ✓ + time / dashed "Not yet" / grey "back Mon").
  - **Blockers:** 44px check target, text, by + time, task chip, "Can help: @Sara K.", "Resolved by Anu".
  - **Updates:**
    - My dashed placeholder: "3 suggestions from yesterday are ready".
    - Post cards: avatar, name, "You" chip, title · time, ⋯; Yesterday / Today / Blockers; reaction pills + Add; "Sara, Bat and 1 more reacted"; latest reply; "View all 3 replies"; a "Reply to …" field.
  - Out-of-office card.
  - Sticky 48px **Write update** until I post.
- **Interactive:**
  - Swipe or ‹ › changes day (› disabled on today).
  - Tap a reaction to toggle; long-press shows who reacted.
  - The reply field opens the thread.
  - Resolving a blocker shows Undo.
  - Past days: replies only.
- **Endpoints:**
  - `GET /standup-groups/:id/days/:date` (strip, counts, entries, blockers with helpers/`canResolve`/replies, reactions with users, `myEntry`, prev/next/upcoming, `editable`, `meeting`).
  - `GET …/suggestions`.
  - `PUT|DELETE /standup-entries/:id/reactions/:emoji`, `POST|DELETE /standup-blockers/:id/resolve`.
  - `GET /workspaces/:id/standup-groups`.
- **Gaps:**
  - The day DTO's `meeting` has no current speaker or turn **(v)**, so the banner calls `GET …/meeting` while live.
  - Post order (conflict 11).
  - G5.
  - "Start" is drawn for Anu, who isn't the facilitator: show it only when `canDrive`.

#### Who reacted (03), Replies thread (04), Group switcher (05)
- **Who reacted:** All / per-emoji tabs; rows with name and job title (`group.members[].title`).
- **Replies:** the header quotes a blocker; replies with 32px avatars; the composer on the keyboard. `POST /standup-entries/:id/replies {blockerId?, mentionIds}`, `PATCH|DELETE /standup-replies/:id`. Whether the thread is per entry or per blocker isn't decided (the web keeps blocker threads separate).
- **Switcher:** 64px rows with a tinted icon tile, a not-posted dot and "4 of 5 posted · you haven't" (G5). Groups have no icon or color **(v)**.

#### Empty day (07)
- "0 of 4 posted · Due 11:00 · async"; "No updates yet today"; **Nudge now** ("Notifies the 3 people who haven't posted"); Write update.
- **Gaps:**
  - No nudge endpoint **(v)**. `standup_notices` allows one reminder per group, user and day.
  - This differs from the web's first-standup empty state (`hasPosts`).

#### Live follower (08), driver (09), create from item (10)
- **Follower:**
  - Header: ⌄ minimize, "● LIVE 06:40", Leave.
  - Turn segments, "Turn 3 of 5 · Up next: Dorj".
  - Speaker: 56px avatar, name 22/30, a Geist Mono 24/30 timer "01:12 / 2:00" with a bar.
  - The speaker's items at 16/24; speaking order (✓ 1:46 / Speaking / Up next / Out · skipped); a reaction bar.
- **Driver:**
  - End (confirm); over-time in red "+0:14 over".
  - "+ Task" on Today and Blocker items.
  - A yellow Meeting notes box.
  - "‹ Previous" and "Next · Anu ›".
- **Create from item:** "From Dorj's update" chip; prefilled assignee, due **Tomorrow**, project, priority **Medium**; an "Add to meeting notes" switch.
- **Endpoints:**
  - `GET …/days/:date/meeting` (`order`, `currentUserId/currentStartedAt`, `durations`, `canDrive`, `serverNow`).
  - `POST …/meeting/start|advance|end`, `PATCH …/meeting {notes}`, `POST …/meeting/save-notes`.
  - The task route, then `POST …/meeting/tasks`.
  - Realtime `standup.meeting_changed`.
- **Gaps:**
  - The meeting back-link needs the web origin (G9).
  - "Add to meeting notes" is client-side (append + `PATCH`): new behaviour.
  - The due and priority defaults differ from the web.
  - "Notes saved to the group" vs the web's explicit Save. Should the phone save on End?

#### Out of office sheet (11)
- **On screen:** presets Tomorrow / Rest of week / Next week / Custom; From / Until; a range calendar; note; "Back Mon, Oct 19 · 5 work days"; Set out of office.
- **Endpoints:** `GET|POST /workspaces/:id/members/:me/absences`, `PATCH|DELETE /workspaces/:id/absences/:id` (409 `ABSENCE_OVERLAP`, note ≤ 80).
- **Gaps:**
  - G7.
  - Editing or deleting an existing absence isn't drawn; the routes support both.

#### Write update (`StandupWriteMobile`, already built on web under 640px)
- **On screen:** "Your standup · Mobile team · Fri, Oct 9"; Yesterday suggestions (52px rows with ×) + "Add something else…"; Today chips + "Anything else?"; blockers with Link a task / Who can help; sticky Post with "Visible to the 6 people in Mobile team".
- **Endpoints:** `GET …/suggestions`, `GET …/days/:date`, `PUT …/days/:date/entry`, search for the task picker.
- **Gaps:** none.

### 1.9 More, Search, Settings — `MobileMore`

#### More tab (01)
- **On screen:**
  - Title 30/36; a search field.
  - Me card: avatar, name, title, "Active · Ulaanbaatar 09:41".
  - Workspace row: "Owner · 9 members", Switch with an unread dot.
  - Feedback (badge), Reports, Settings, Help; Sign out.
  - Footer: "Kite Tasks 4.2.0 (418) · host".
  - The More tab shows a dot when Feedback is unread or another workspace has unread notifications.
- **Endpoints:** sidebar (`feedbackUnreadCount`), unread-counts, `/auth/me`, members (count), presence (B1).
- **Gaps:**
  - Help, Terms and Privacy have no URLs.
  - Reports entries follow the web role rules (People is admins only).

#### Search (02 recent · 03 results · 04 "APP-142" jump)
- **On screen:**
  - Field with clear and Cancel; scope chips All / Tasks / Projects / People.
  - **Recent:** recent searches (device-only, removable) and recently viewed.
  - **Results:** grouped, 3 rows per group, with "See all" and `<mark>` highlights.
  - **Key mode:** a jump card ("Go straight to task") + "Mentioned in · 3".
- **Endpoints:** `GET /workspaces/:id/search?q&offset` (tasks, ≤5 projects, ≤5 people, ≤5 comments), `GET /tasks/:ref?workspaceId=` (jump + `mentionedIn`).
- **Gaps:**
  - G12.
  - The API's comment hits have no group in the design.
  - Standup mentions are never indexed (conflict 13).

#### Settings (05 top · 06 bottom · 08 time zone) + Edit profile (07)
- **Settings rows:** profile; Language / Theme / Accent (apply instantly); Time zone; Out of office; Notifications ("Push on · quiet 22:00–08:00"); About (version, server, Terms, Privacy); Sign out; red Delete account.
- **Time-zone sheet:** a "Set automatically" switch, search, a city list with GMT offsets.
- **Edit profile:** 8 avatar swatches, name ("Your team sees 'Anu B.'"), job title read-only ("Set by a Kite Studio admin"), email read-only.
- **Endpoints:**
  - `PATCH /me` (name, avatarColor, locale, timezone, theme, accent, density, notificationPrefs).
  - Absences routes.
  - `shortName` from shared.
- **Gaps:**
  - "Set automatically" isn't stored **(v)**: either a client-only PATCH when the device zone changes, or a server flag.
  - Quiet hours.
  - Accent per device (conflict 9).
  - Pink vs yellow (conflict 8).

#### Delete account (09 ready · 10 final alert · 11 blocked owner)
- **On screen:**
  - Consequences: leave every workspace; a workspace with only you is deleted; tasks, comments and standups stay as "Deleted user"; signed out everywhere; can't be undone.
  - Password confirm; red "Delete my account"; a final alert.
  - Blocked state: "Transfer ownership of Kite Studio first" with a Transfer button.
- **Endpoints:** B14.
- **Gaps:**
  - No ownership transfer: `PATCH …/members/:id` answers 409 `OWNER_ROLE` **(v)**.
  - Single-member "personal" workspaces don't exist, so that consequence line may be moot.

### 1.10 Feedback — `MobileFeedback` (optional)

#### Inbox (01 · 02 search · 03 no match)
- **On screen:**
  - "‹ More", ⋯, "Feedback · N unread".
  - Search "title, ID or submitter".
  - Type tabs with counts; status chips with counts (the selected one inverted).
  - Rows: unread dot, type badge, mono ref, date, 2-line title (bold when unread, hit highlighted), submitter, tinted status pill, linked task key.
  - Empty: "No feedback matches" + Clear filters.
  - Swipe: read/unread, close.
- **Endpoints:** `GET /workspaces/:id/feedback?q&type&status&offset&limit` (with `typeCounts`, `statusCounts`, `unread`), `POST /feedback/:id/read`, `PATCH /feedback/:id {status}`.
- **Gaps:**
  - Status set (conflict 12).
  - No mark-unread for feedback **(v)**.

#### Detail (04 · 05 · 09 after linking), status sheet (06), link task (07), create task (08)
- **Detail:**
  - Header: type badge, status pill (→ sheet), title 22/30.
  - Submitter with a masked email; source line "In-app form · Oct 7, 21:42"; body.
  - Attachments, video tile included.
  - Device info card (App version, Network, Free storage); Copy.
  - Linked task card or Link / Create.
  - Internal notes with @mentions ("Team only"); History.
  - Undo toast "Linked to CHK-75 · status set to Planned".
- **Status sheet:** radio rows + a "Notify the submitter" switch.
- **Link sheet:** suggested tasks with a reason ("title match", "has FB-1037").
- **Create sheet:** prefilled title, description, chips (assignee, project, priority, tag, due) and a "Set status to Planned · Notifies the submitter" switch.
- **Endpoints:**
  - `GET /workspaces/:id/feedback/:ref`, `POST /feedback/:id/notes`.
  - `GET /feedback/:id/attachments/:aid/download`.
  - `PUT|DELETE /feedback/:id/link`, `GET /feedback/:id/task-suggestions`, search.
  - `POST /feedback/:id/create-task`.
- **Gaps:**
  - Device fields and "source" don't exist; the design assumes an in-app SDK **(v)**.
  - `text/plain` isn't an accepted type **(v)**.
  - Video needs Range (G6).
  - Notes are plain text with no `mentionIds` **(v)**.
  - The email is returned unmasked: masking would be client-only.
  - Updating `notify_on_done` per item isn't possible (`updateFeedbackSchema` is `{status}`) **(v)**.
  - Suggestions have no reason and no `q` **(v)**.
  - Create-task has no `tagIds` **(v)**: follow up with `PUT /tasks/:id/tags`.
  - One switch maps to two API fields (`setLinked` + `notifyOnDone`).

### 1.11 Reports — `MobileReports` (optional, read-only)

#### My performance (01 · 02 · 03 period sheet · 07 empty)
- **On screen:**
  - My performance | Workload segments; a period button; ↗ open in browser.
  - Four stat cards: Tasks completed, Done on time %, Avg. cycle time, Points done.
  - Charts:
    - Columns "Completed per week, last 8 weeks" (tap a bar for a tooltip, "(so far)").
    - A cycle-time line.
    - "By project" horizontal bars.
    - Each has "View as table".
  - "Open in browser for full reports".
  - Period sheet: This week, Last week, Last 30 days, This month, This quarter, Custom → web; "Compare with previous period".
  - Empty: "Not enough data yet" + Go to My Tasks.
- **Endpoints:** `GET /workspaces/:id/reports/people/me?period=` (`completed`, `onTime`, `cycleTime`, `trends.weeks` → last 8, `completedTasks[].project` aggregated on the client).
- **Gaps:**
  - "Last 30 days" ≠ `4w` (28 days); "This month" (to date) doesn't exist; send it as `custom` **(v)**.
  - "Avg." labels show medians.
  - The empty state is per person in the design, per workspace scope in the API **(v)**.
  - Delta coloring (conflict 10).

#### Workload (04 · 05 · 06 person sheet)
- **On screen:**
  - Space picker.
  - Stat cards: Open, Overdue, Due next 7 days, Unassigned (with deltas).
  - Load per person: a 10px bar, an over-capacity segment, a capacity tick, "Out · until Oct 12".
  - "Due in the next 7 days" by day; "By status" bars.
  - Person sheet: KPI tiles + open tasks.
- **Endpoints:** `GET /workspaces/:id/reports/workload?spaceId=`, `GET …/reports/overview` (overdue).
- **Gaps:**
  - No previous values, so no deltas **(v)**.
  - No Unassigned count **(v)**.
  - Buckets are today → Sunday, not a rolling 7 days, and unassigned tasks are missing **(v)**.
  - No status on `workloadTaskSchema` **(v)**, so "By status" and the person sheet's markers have no source.
  - The period button means nothing here: the endpoint takes no period.

Chart shapes:
- Rounded columns with dashed gridlines.
- One polyline with ringed dots.
- Horizontal bars with a capacity tick.

There is no burndown or Sprints view on the phone. Views draw the bars; the line needs `react-native-svg`.

---

## 2. Native components

The main source is `MobileFoundations.dc.html`. Web paths are under `apps/web/src/`. "New" means there is no web counterpart.

### 2.1 Mobile tokens (`apps/mobile/src/theme/`)
Tokens mirror `styles/tokens.css` + `palette.css`, with these phone additions or changes (light / dark):

- **Type:**
  - Large title 28/34 (More 30/36, −0.02em).
  - Sheet titles 17/22; nav titles and buttons 16/22.
  - **Base 15/22** (web 14/20).
  - Inputs 16 (no iOS zoom); detail body 16/24; meta 13/18; keys Geist Mono 12; tab labels 11/14.
  - Stat values 30/36; KPI tiles 20/26.
- **Radii:**
  - 6: tags, due chip.
  - 7: 28px tile.
  - 8: segment, 32px tile.
  - 10: search, segment track, text buttons.
  - 11: Blocked pill.
  - 12: buttons, fields, board cards, presets, toast.
  - 14: cards, columns, template cards.
  - 16: sheets, FAB, alerts.
  - 18: chips.
- **Sizes:**
  - Touch target ≥ 44.
  - Header 44 (large-title row) or 56 (compact).
  - Tab bar 49 + safe area.
  - Task row ≥ 64; sheet row ≥ 52; property row 52.
  - Buttons and fields 48; chips 36; segmented 40 (44 hit); FAB 56.
  - Picker pane 336.
- **Surfaces:**
  - `surface` #F7F7F8 / #161618.
  - `raised` (sheets) #FFF / #1B1B1E.
  - `fill` #F4F4F5 / #1F1F23.
  - `seg` #F1F1F3 / #1F1F23 (Reports #E9E9EC); selected segment in dark #2A2A30.
  - `grabber` #D4D4D8 / #3F3F46; checkbox border #C4C4CC / #4A4A52.
  - Skeleton #EDEDF0 / #232328 and #F4F4F5 / #1B1B1E.
  - Divider #EFEFF2 / #1F1F23.
- **Status and danger:**
  - Danger text, field errors and the danger button use #DC2626 (overdue stays #C42B1C).
  - Due chip backgrounds:
    - overdue #FDECEC / rgba(248,113,113,.14);
    - today #FDF0DC / rgba(251,191,36,.14);
    - soon/later use `chip`.
  - Blocked pill in dark: rgba(248,113,113,.14) + #FCA5A5.
- **Swipe actions:** complete #15803D; more #71717A / #3F3F46; read = accent; archive #52525B.
- **Toast:** #18181B / #EDEDEF; the action uses accent-ink in light and the raw accent in dark.
- **Scrim:** .32 / .60 (web dark .56).
- **Image viewer:** pure #000.
- **Shadows:**
  - Sheet `0 -8px 32px rgba(24,24,27,.12)` / `rgba(0,0,0,.5)`.
  - FAB `0 2px 4px rgba(24,24,27,.08), 0 8px 20px rgba(24,24,27,.18)` (dark .3/.45).
  - Lifted card `0 2px 6px rgba(0,0,0,.08), 0 20px 40px rgba(0,0,0,.22)`.
  - Menu = `--shadow-popover-lg` with a dark variant.
  - RN shadows: iOS `shadow*` props, Android `elevation` / `boxShadow` (New Architecture).
- **Highlights:** search hit #FEF08A / rgba(250,204,21,.28); notes box #FFFBEB / #F5E6B8 (dark #18160F / #3A3220); conflict alert #FFFBEB / #FDE68A.
- **Accent-ink in dark per accent:** #B4A5FF, #93B4FF, #5EEAD4, #D4D4D8.

### 2.2 Kit (B4)

| Native | Props | Web counterpart |
|---|---|---|
| `TabBar` | `active, inboxCount, standupPending, moreDot` | new (web phone shell is `features/shell/MobileNav.tsx`) |
| `Fab` | `onPress, lifted, hidden` | new (opens `features/create/QuickCreateModal.tsx`) |
| `LargeHeader` | `workspace, dateLine?, title, collapsed, onSearch, onAccount, online` | `features/shell/WorkspaceSwitcher.tsx`, `UserMenu.tsx` |
| `NavHeader` | `variant: 'collapsed'\|'pushed'\|'modal', title, subtitle?, dot?, left?, right?: IconAction[]` | `features/views/PageHeader.tsx` |
| `WorkspaceTile` | `name, size: 24\|28\|32\|36\|40, color?` | `components/ui/WorkspaceTile.tsx` |
| `StatusMarker` | `category, color?, size=12` (6 categories, incl. pause bars and ×) | `components/ui/StatusDot.tsx` |
| `PriorityFlag` | `priority, size=16` | `components/ui/PriorityFlag.tsx` |
| `DueChip` | `date, today, done, variant: 'chip'\|'text'` (tone from shared `dueTone`) | `components/ui/DueDate.tsx` |
| `TagChip` | `tag, size` | `components/ui/TagChip.tsx` |
| `ProjectPill` / `ProjectDot` / `SpaceBadge` | `project` / `color, size` / `space, size` | `components/ui/ProjectDot.tsx`, `SpaceBadge.tsx` |
| `Avatar` / `AvatarStack` | `person, size: 16–56, dim?, online?, ring?` / `people, max, size` | `components/ui/Avatar.tsx`, `AvatarStack.tsx` |
| `BlockedPill` / `BlockedBanner` | `blocked: TaskBlocked, onPress?` | `features/standup/BlockedMarker.tsx` |
| `ProgressBar` | `done, total, width, height` | `components/ui/ProgressBar.tsx` |
| `TaskRow` | `task: TaskListItem\|MyTask, showProject?, showDue?, selectMode?, selected?, onStatusPress, onPress, onLongPress` | `features/list/TaskRow.tsx`, `features/my-tasks/MyTaskRow.tsx` |
| `SwipeableRow` | `left?: SwipeAction, right?: SwipeAction, fullSwipe?` | new |
| `GroupHeader` | `label, count, marker?, tone?: 'danger', open, onToggle, onAdd?, hint?, sticky` | `features/list/GroupHeader.tsx`, `features/my-tasks/TaskSection.tsx` |
| `BottomSheet` | `title, mode: 'single'\|'multi', search?, footer?, onDone?, onClose, snapPoints?` | `components/ui/Picker.tsx`, `Popover.tsx`, `Modal.tsx` |
| `SheetOption` | `lead, label, sub?, note?, selected, multi, disabled?` | `features/pickers/*` rows |
| `StatusSheet` | `statuses, value, onPick` | `features/pickers/StatusPicker.tsx` |
| `AssigneeSheet` | `members, value[], projectTeam?, onChange` ("Away until" via shared `awayUntil`) | `features/pickers/AssigneePicker.tsx`, `useMemberHint.ts` |
| `DueSheet` / `DatesSheet` | `value, presets, onChange` / `start, due, active` | `features/pickers/DuePicker.tsx`, `components/ui/DateField.tsx` |
| `MonthGrid` | `month, selected?, range?, today, dots?, dropTarget?, onSelect, onSwipe` | `features/calendar/DayCell.tsx`, `calendarGrid.ts` |
| `PrioritySheet`, `SizeSheet`, `TagSheet`, `SprintSheet`, `ProjectSheet` | `value, onChange` (+ `canCreate` for tags) | `features/pickers/{Priority,Size,Tag,Sprint,Project}Picker.tsx` |
| `ActionSheet` | `header?: {key, title}, actions: {icon, label, danger?, onPress}[]` | `components/ui/Menu.tsx` |
| `ConfirmAlert` | `title, body?, confirmLabel, danger` (native `Alert`) | `components/ui/ConfirmDialog.tsx` |
| `Toast` / `UndoToast` | `tone, text, sub?, action?, duration` | `components/ui/Toaster.tsx`, `stores/toast.ts` |
| `Button` | `variant: 'primary'\|'secondary'\|'danger'\|'text'\|'textMuted', size: 48\|44, loading?, disabled?` | `components/ui/Button.tsx` |
| `TextField` / `PasswordField` | `label, hint?, error?, readOnly?, lockedLabel?, mono?` / `+ reveal, strength?` | `components/ui/TextField.tsx` |
| `SearchField` | `value, onChange, onClear, onCancel?, autoFocus?` | `features/shell/SidebarSearch.tsx` |
| `SegmentedControl` | `options, value, onChange` | `components/ui/SegmentedControl.tsx` |
| `Chip` | `label, on, icon?, count?, caret?, removable?` | `components/ui/FilterChip.tsx`, `FieldChip.tsx` |
| `UnderlineTabs` | `tabs: {key, label, count?}[], value, scroll?` | `components/ui/UnderlineTabs.tsx` |
| `Switch` | `value, onChange, disabled?` (native) | `components/ui/Switch.tsx` |
| `ListGroup` / `ListRow` | `title?` / `icon?, label, sub?, value?, badge?, chevron?, destructive?` | `features/settings/SettingsRow.tsx` |
| `EmptyState` / `ErrorState` | `illustration, title, body, cta?` / `title, body, onRetry` (refetches errored queries) | `components/ui/EmptyState.tsx`, `components/ErrorState.tsx` |
| `Skeleton` / `SkeletonRow` | `width, height, radius` | `components/ui/Skeleton.tsx`, `features/list/ListSkeleton.tsx` |
| `OfflineBanner` | `state: 'offline'\|'synced', pending?` | `features/shell/ConnectionPill.tsx` |
| `InlineAlert` | `tone: 'error'\|'warning'\|'success', title, body, action?` | new |
| `RichTextView` | `doc, onMention, onTaskKey, onLink, variant: 'body'\|'comment'` | `components/editor/RichTextView.tsx` |
| `RichTextEditor` | `doc, mentionCandidates, onDone` (WebView; see §4) | `components/editor/RichTextEditor.tsx`, `EditorToolbar.tsx` |
| `MentionInput` | `value, candidates, onChange, onSubmit` (plain `TextInput` + suggestions) | `features/task/activity/CommentComposer.tsx`, `components/editor/MentionList.tsx` |
| `ImageViewer` | `images: Attachment[], index, onClose, onShare` | `features/task/attachments/ImageViewer.tsx`, `components/ui/Lightbox.tsx` |
| `KeyboardPane` | `open, onKeyboard, children` (picker in place of the keyboard) | new |

### 2.3 Feature composites

| Feature | Native (key props) | Web counterpart |
|---|---|---|
| Auth | `SignInScreen`, `ServerField({url, status, version?})`, `InviteHeader({workspace, expiresAt})`, `NoWorkspaceScreen`, `WorkspaceSwitcherSheet({workspaces, currentId, unread})`, `NotificationPrimer` | `pages/LoginPage.tsx`, `pages/InviteAcceptPage.tsx`, `features/workspace/NoWorkspacePage.tsx`, `features/shell/WorkspaceSwitcher.tsx` |
| My Tasks | `StatCarousel({cards, onPick})`, `WeekBars`, `StandupHomeCard({state, group, day})`, `ActivitySummaryCard`, `ActivityFeedRow({item})`, `SpaceFilterSheet` | `features/my-tasks/{StatCards,WeekBars,StandupCard,ActivityPanel,TaskSection}.tsx`, `feedLine.ts` |
| Projects | `ProjectsTree({favorites, spaces, query, openCounts})`, `SpaceRow`, `ProjectRow`, `FilterSheet({groups, resultCount})`, `SelectionHeader`, `BulkActionBar`, `EmptyProject({templates})`, `TemplateCard` | `features/shell/SpaceTree.tsx`, `features/views/FilterMenu.tsx`, `features/list/{BulkBar,EmptyProject}.tsx` |
| Board | `BoardPager({columns, active})`, `BoardColumnPage({status, cards, onAdd})`, `BoardCard({task, ghost?, onMore})`, `DropPlaceholder`, `EdgePageZone`, `MoveToSheet({task, statuses})` | `features/board/{BoardColumn,TaskCard,DropPlaceholder}.tsx`, `boardDrag.ts` |
| Task detail | `TaskDetailHeader`, `TaskTitleField({conflict?})`, `PropertyRow({label, value, sub?, recentActor?})`, `SubtaskList`, `AttachmentGrid`, `AttachSourceSheet`, `LinkedFeedbackList`, `MentionedInList`, `ActivityFeed({tab})`, `CommentBubble`, `CommentComposer`, `DeletedBanner`, `TaskDetailSkeleton` | `features/task/{TaskHeader,TaskTitle,TaskProperties,LinkedFeedback,MentionedIn,DeletedBanner}.tsx`, `features/task/subtasks/*`, `features/task/attachments/*`, `features/task/activity/*` |
| Create | `CreateTaskSheet({defaults: CreateDefaults})`, `FieldChip({state, leading, label})`, `InlineCreatedBanner({taskKey, ttl})`, `DiscardAlert` | `features/create/QuickCreateModal.tsx`, `components/ui/FieldChip.tsx` |
| Inbox | `InboxTabs`, `PinnedReminderCard({group, minutesLeft, postedOf})`, `NotificationRow({n})` (person and system variants), `InboxEmpty({variant})`, `NotificationSettings`, `LevelSheet` | `features/inbox/{InboxView,NotificationRow,InboxEmpty}.tsx`, `inboxLine.ts`, `standupLine.ts`, `features/settings/NotificationsSection.tsx` |
| Calendar | `MonthGrid`, `CalendarAgenda`, `CalendarTaskRow({variant})`, `WeekAgenda`, `ProjectFilterChips({hidden})`, `UnscheduledSheet`, `MoveBanner` | `features/calendar/{CalendarView,CalendarToolbar,CalendarPill,DayCell,UnscheduledPanel}.tsx`, `calendarDrag.ts` |
| Standup | `StandupHeader`, `DayNav`, `LiveBanner`, `PostedStrip`, `BlockerRow`, `EntryCard`, `ReactionPills({size})`, `ReactorsLine`, `WhoReactedSheet`, `ReplyThread({entry, blockerId?})`, `MyPlaceholderCard`, `OutCard`, `StandupTaskChip`, `WriteUpdateBar`, `GroupSwitcherSheet`, `EmptyToday`, `WriteScreen` | `features/standup/{StandupHeader,StandupNav}.tsx`, `day/*` (`PostedStrip`, `BlockersSection`, `EntryCard`, `ReactionBar`, `Replies`, `PersonCards`, `TaskChip`), `write/*` |
| Live | `LiveHeader`, `TurnSegments`, `SpeakerHeader({seconds, limit})`, `LiveItems({canCreate})`, `SpeakingOrderList`, `DriverNotes`, `DriverControls`, `LiveReactionBar`, `CreateFromItemSheet` | `features/standup/live/{StandupLivePage,SpeakingOrder,SpeakerPanel,NotesPanel}.tsx` |
| Out of office | `OutOfOfficeSheet({absence?})`, `RangeCalendar`, `PresetChips` | `features/settings/AbsenceList.tsx`, `MemberDialogs.tsx` |
| More / Settings | `MeCard`, `SearchScreen`, `ScopeChips`, `SearchResultRow({kind, highlight})`, `JumpCard`, `Highlight`, `SettingsScreen`, `EditProfile`, `ColorSwatches`, `TimeZoneSheet({auto})`, `DeleteAccountScreen` | `features/palette/CommandPalette.tsx`, `features/settings/*`, `components/ui/ColorSwatches.tsx`, `components/TimezonePicker.tsx` |
| Feedback | `FeedbackRow`, `TypeBadge`, `FeedbackStatusPill`, `StatusChips`, `AttachmentTiles`, `DeviceInfoCard`, `LinkedTaskCard`, `InternalNotes`, `HistoryList`, `FeedbackStatusSheet`, `LinkTaskSheet`, `CreateTaskFromFeedbackSheet` | `features/feedback/{parts.tsx, TaskPicker.tsx}`, `inbox/FeedbackTable.tsx`, `detail/{FeedbackMain,FeedbackSide,CreateTaskModal}.tsx` |
| Reports | `StatRow({label, value, unit, delta})`, `ChartCard({title, table})`, `ColumnChart`, `LineChart`, `HBarList`, `PeriodSheet`, `PersonLoadSheet`, `OpenOnWebCard`, `ReportsEmpty` | `components/ui/StatCard.tsx`, `features/reports/{PeriodControl,ReportsEmpty}.tsx`, `charts/{ChartFrame,LineTrend,BarByCategory,StackedBar}.tsx`, `workload/PersonTasks.tsx` |

---

## 3. Shared code

### 3.1 Reuse from `packages/shared` as-is
- **Every zod schema and DTO type** (`schemas/*`): responses are parsed with the same schemas as the web.
- **Enums and lists:** `enums.ts` (statuses, `CLOSED_CATEGORIES` / `isClosedCategory`, priorities, `SIZE_POINTS`, palette keys, accents, notification types/prefs/levels, `prefKeyOf`, `TEMPLATE_IDS`, standup enums).
- **Domain helpers:**
  - `dates.ts`: `todayInZone`, `addDays`, `weekdayIndex`, `startOfWeek`, `daysBetween`, working days.
  - `task-key.ts`: `parseTaskKey`, `findTaskKeys`, `splitTaskKeys`, `formatTaskKey`.
  - `people.ts`: `shortName(s)`, `matchesName`, `nameSearchKey`, `initialsFor`.
  - `permissions.ts`: `canManageCreated`, `canManageTags`, `canManageSprint`, `canCreateStandupGroup`, `canManageStandupGroup`, `canDriveMeeting`.
  - `rich-text.ts`: `richTextToPlain`, `extractMentionIds`, `plainToRichText`, `richTextDocSchema`.
  - `standup.ts`: `groupToday`, `isStandupDay`, `previousStandupDay`, `nextStandupDay`, `zonedTimeToZone`, limits.
  - `schemas/absence.ts`: `currentAbsence`, `isAway`, `awayUntil`.
  - `feedback.ts`: `validateFeedbackForm`.
  - `reports.ts`, `attachments.ts` (`MAX_ATTACHMENT_BYTES`, `isBlockedFilename`), `project-key.ts`.
- **Realtime:** `realtimeServerMessageSchema`, `REALTIME_CLOSE_UNAUTHORIZED`, event names.

Platform notes for B2:
- Shared source imports its siblings with `.js` specifiers (`./dates.js` → `dates.ts`). Check that Metro resolves these in the pnpm monorepo. If it doesn't, add a small `resolver.resolveRequest` in `metro.config.js` that retries `.js` as `.ts` for `@kite/shared`.
- `todayInZone` and the standup zone helpers use `Intl.DateTimeFormat` with `timeZone`. Hermes supports this; add a jest-expo test plus one on-device check (Android) for `Asia/Ulaanbaatar` and a DST zone.
- zod v4 and the pure-TS helpers work in React Native unchanged.
- Mobile can be on React 19 while web stays on 18: shared has no React dependency.

### 3.2 Move from `apps/web` into `packages/shared`

Two entry points, so the API never pulls client-only dependencies:
- `@kite/shared`: pure TS, zod only.
- New `@kite/shared/client` (`packages/shared/src/client/`, its own `exports` entry): code that needs `@tanstack/query-core` (a peer dependency; both apps' react-query re-exports it), `fractional-indexing` or `chrono-node`.

Both apps import from these and delete their copies. Hooks, Zustand stores, dnd-kit/TipTap glue and anything that returns JSX or class names stay per app.

| Web source | → Shared | Change needed |
|---|---|---|
| `api/queryKeys.ts` | `client/query-keys.ts` | none (pure `as const` arrays); also move `TASK_MUTATION` from `api/taskCache.ts` |
| `api/client.ts` (`ApiError`, `parseRetryAfter`, `toQuery`, `apiFetch`, `apiSend`) | `client/http.ts` | `createApiClient({ baseUrl, fetch, headers(), credentials, onUnauthorized })`. Web: cookie + same origin. Mobile: bearer header. Errors parsed with the shared error schema |
| `lib/mutationErrors.ts` `errorMessage` | `client/errors.ts` | error code → i18n key mapping; the toast parts stay per app |
| `realtime/socket.ts` (`RealtimeSocket`, `backoffDelay`, watchdog) | `client/realtime-socket.ts` | inject `createSocket(url)` (mobile adds the `Authorization` header) and a `lifecycle` adapter (web: online/pagehide/visibilitychange; mobile: `AppState` + NetInfo, close after a delay in background) |
| `realtime/applyMessage.ts` (`createMessageHandler`: event → patches + coalesced invalidation, report throttle, busy guard) | `client/realtime-cache.ts` | type against `QueryClient` from query-core. Replace the `useRealtimeStore` import with an `onRecentEdit(edit)` callback and the presence branch with `onPresence`. `refreshAfterAbsences`, `refreshAfterSprintChange` and `setMeeting` (cache helpers in `api/absences.ts`, `api/sprints.ts`, `api/standups.ts`) move with it. Also `RECENT_EDIT_MS`, `EditedField` and the `EDITED_BY` map. Its tests move too |
| `api/taskCache.ts` (`patchLists`, `patchDetail`, `patchTask`, `restore*`, `writeTask`, `bumpCount`, `settle`) | `client/task-cache.ts` | none: the optimistic update + rollback helpers. The `useMutation` wrappers stay per app and call them |
| `api/homeCache.ts` (`applyCompletion`, `applyStatus`, `sectionOf`, `withRow`), `api/workloadCache.ts` | `client/home-cache.ts`, `client/workload-cache.ts` | none, once `todayFor` moves |
| `features/list/positions.ts` `placeInStatus` + `isTempTask` (`api/tasks.ts`) | `client/positions.ts` | none (fractional-indexing) |
| `lib/dates.ts` (`dueTone`, `relativeDay`, `formatDate`, `formatRange`, `todayFor`, `DEFAULT_TIMEZONE`) | `dates.ts` | drop date-fns: English `MMM d` from a month table. `DUE_TONE_CLASS` stays on web |
| `lib/useDates.ts` `WEEKDAYS`, `MONTHS` keys | `dates.ts` | the hook stays per app (a thin wrapper) |
| `lib/relativeTime.ts` (`relativeTime`, `formatTime`, `formatClock`, `fileSize`) | `time.ts` | none |
| `lib/parseDue.ts` | `client/parse-due.ts` | none (chrono-node) |
| `lib/sprint.ts` (`sprintLabel`, `nextSprintDates`) | `sprint.ts` | `TFunction` → a minimal `Translate` type |
| `lib/mn.ts`, `lib/palette.ts` `colorFor`, `lib/paths.ts` (`wsPath`, `appPath`, `switchTarget`) | `format.ts`, `paths.ts` | none; `paletteClass` stays on web |
| `features/standup/day/links.ts` (`dayHref`, `writeHref`), `blockedText.ts` `blockedHref`, `inbox/standupLine.ts` `standupHref`, `useTaskKeyHref` path part | `paths.ts` | one set of paths for web routes, Expo Router routes, push payloads and universal links |
| `components/editor/typedMentions.ts` `resolveTypedMentions`, `UNRESOLVED_MENTION`; `components/editor/mentions.ts` `filterMentions`, `MentionCandidate`, `MAX_SUGGESTIONS` | `mentions.ts` | JSON-only. `prepareBody(editor)` stays on web |
| `features/views/useViewParams.ts` constants (`SORT_FIELDS`, `GROUP_FIELDS`, `NO_SPRINT`, `ALL_DONE`, `ASSIGNEE_ME`, `ViewFilters`, `clearedFilters`, `activeFilterFields`), `views/taskQuery.ts` `toTaskQuery`, `useTaskQuery.ts` `RECENT_DONE_DAYS` | `task-views.ts` | URL parsing (`readFilters`) stays on web; mobile keeps filters in its UI store |
| `features/list/grouping.ts` (`sortTasks`, `groupTasks`) | `task-views.ts` | none |
| `features/board/boardDrag.ts` (`dropTarget`, `isNoop`, `sameTarget`, `keySlot`) | `board.ts` | none (the neighbour computation for `prevId`/`nextId`) |
| `features/calendar/calendarGrid.ts` (`calendarDays`, `shiftPeriod`, `periodTitle`, `placeTasks`, `visiblePills`), `calendarDrag.ts` `dropDue` | `calendar.ts` | move `CalendarMode`; `pointInside` stays on web (dnd-kit) |
| `features/standup/write/draft.ts` (`initialDraft`, `draftBody`, `contentKey`, `isEmptyBody`, `sentBlockerUids`, `withSavedBlockerIds`, `SUGGESTED_YESTERDAY`) | `standup-draft.ts` | none. The autosave rules in `useWriteForm.ts` (2 s, never on open, never posted or empty, save on close) are re-implemented as a hook on mobile, using `AUTOSAVE_MS` from shared |
| `features/standup/live/meeting.ts` (`isSkipped`, `neighbor`, `spokenSeconds`, `totalSeconds`, `clockLabel`, `taskTitleOf`, `createdFrom`, `backLinkDoc`, `entryOf`), `useStandup.ts` `waitingForMe`, `format.ts` (`daysLabel`, `zoneLabel`) | `standup-meeting.ts`, `standup.ts` | `TFunction` → `Translate`; `backLinkDoc` already takes the href |
| Sentence builders: `my-tasks/feedLine.ts`, `inbox/inboxLine.ts`, `inbox/standupLine.ts`, `task/activity/historyLine.tsx` (`historyLine`, `historyMarker`) | `lines/*.ts` | they return an i18n key + values. `lineComponents` (JSX) stays per app. Both apps need the same keys (see the locales question) |
| Permission checks inline in web: `canModerate` (`features/task/TaskContext.ts`), `role !== 'member'` (`MembersSection`, `ArchivedProjectsSection`, `reports/useReportsRole.ts`), comment/attachment delete rules (`CommentItem.tsx`, `AttachmentSection.tsx`), `isDone`/`isClosed` (`list/ListContext.ts`, duplicated in `calendarGrid.ts`) | `permissions.ts` | `isWorkspaceAdmin(role)`, `canDeleteComment(comment, meId, role)`, `canDeleteAttachment(att, meId, role)`, `canInvite(role)`, `canSeePeopleReports(role)`, `isClosedTask(task)` |
| `features/list/EmptyProject.tsx` template catalog metadata | `templates.ts` | ids + task counts + i18n keys; icons stay per app |

Not moved:
- `stores/ui.ts`: the mobile UI store has different fields, but follows the same per-user `kite.ui.<userId>` scoping.
- `stores/realtime.ts`: a tiny Zustand store; each app owns its own.
- TipTap `editorExtensions`: DOM-bound. The mobile WebView editor bundle may import it (§4).
- `lib/clipboard.ts`, `useCopyLink`, `useMediaQuery`, `useVisualViewport`: web-only.

---

## 4. Libraries (one recommendation each)

| Concern | Recommendation | Why / notes |
|---|---|---|
| Framework | **Expo SDK (latest stable at B2), New Architecture, dev builds** (not Expo Go) | Push, secure store and the WebView editor need a dev build. React 19 on mobile is fine |
| Routing | **Expo Router**, typed routes | Same URL shape as the web, so universal links and push payloads map 1:1. Tree: `app/(auth)/sign-in`, `invite/[token]`; `app/w/[slug]/(tabs)/{my-tasks,projects,inbox,standup,more}`; pushed `w/[slug]/p/[projectId]/[view]`, `s/[spaceId]/[view]`, `t/[taskKey]`, `standup/[groupId]/[date]`, `…/live`, `feedback`, `reports/[tab]`, `settings/…`, `search`; `create` as a modal route (`presentation: 'formSheet'` on iOS) |
| Styling | **`StyleSheet` + a typed token module + `useTheme()`** (light/dark/accent from `PATCH /me` prefs + `useColorScheme`) | Web Tailwind classes don't port, so NativeWind would add a compile layer without sharing anything. Plain objects are the simplest for someone new to RN, keep tokens typed, and make the B2 drift test (parse `tokens.css`/`palette.css` and compare) easy. Unistyles 3 is the upgrade path if theme switches re-render too much |
| Bottom sheets | **`@gorhom/bottom-sheet` v5** | Grabber, snap points, scrim tap, keyboard handling, dynamic sizing, `BottomSheetFlatList` for long pickers. Simple alerts use the native `Alert` |
| Keyboard | **`react-native-keyboard-controller`** | Sticky composer and toolbar above the keyboard (`KeyboardStickyView`), the create sheet's picker pane at keyboard height (it reports the keyboard height), sticky Post on the write screen |
| Lists | **`@shopify/flash-list` v2** | Recycling for List/My Tasks/Inbox, sticky group headers (`stickyHeaderIndices`) over a flattened sections array. Board columns are one FlashList per page inside a horizontal pager |
| Gestures / animation | **`react-native-gesture-handler` + `react-native-reanimated`** (with `react-native-worklets`) | Swipe rows (`ReanimatedSwipeable`), long-press lift, pinch-zoom, pull-to-refresh polish |
| Drag & drop | **Custom on gesture-handler + Reanimated** for the Board (lift, cross-column, 0.5 s edge paging, placeholder) and Calendar (drop on a day). **`react-native-reorderable-list`** for reorder inside one list (subtasks) | No maintained library handles cross-page drops. The drop math reuses shared `board.ts` / `calendar.ts`; the non-drag "Move to…" path is required anyway |
| Rich text: read | **Own renderer over TipTap JSON** (`RichTextView`) | Only 12 node and 6 mark types (§1.4); native `Text` nesting, mention chips, `splitTaskKeys` links. No WebView for reading |
| Rich text: edit | **`@10play/tentap-editor`** (TipTap in a WebView), advanced setup with a custom editor bundle built from the same TipTap extensions as the web (`components/editor/extensions.ts`), so the output passes `richTextDocSchema`; the native toolbar sits above the keyboard and mention suggestions are a native list fed over the bridge | Only the task description needs it. **Comments, replies, the create description and standup text use plain `TextInput`** with `@` suggestions, converted by `plainToRichText` + `resolveTypedMentions` (both shared), as the designs draw them as plain fields |
| Server state | **`@tanstack/react-query` v5** + **`@tanstack/query-async-storage-persister`** over MMKV, `focusManager` ← `AppState`, `onlineManager` ← NetInfo | Same keys and cache helpers as web (`@kite/shared/client`). Mutations pause offline; replaying creates waits on G15 |
| Secure storage | **`expo-secure-store`** for the session token; **`react-native-mmkv`** for the query cache and the per-user UI store (Zustand `persist`) | Keychain/Keystore for the secret only; MMKV is fast synchronous storage for everything else |
| Network status | **`@react-native-community/netinfo`** | Offline banner, `onlineManager`, socket reconnect |
| Image picking / upload | **`expo-image-picker`** (camera + library), **`expo-document-picker`** (files), **`expo-image-manipulator`** (downscale to ~2048px and HEIC → JPEG before upload); upload with `FormData` over `XMLHttpRequest` for progress | Matches the design's "Photos are resized automatically" without server work, and keeps web previews working (HEIC can't preview inline) |
| Image display | **`expo-image`** with the `Authorization` header and `cacheKey` = attachment id; **`react-native-awesome-gallery`** for the viewer (swipe, pinch, drag to close) | Attachments are immutable, so caching by id is safe until the server sends ETags (G6) |
| Video (feedback) | **`expo-video`** | Needs server `Range` support first (G6) |
| Push | **`expo-notifications`** + the Expo push service (server: `expo-server-sdk`), pending the B11 decision | One token for APNs + FCM, receipts for dead tokens; direct APNs/FCM is the fallback if text must not leave the server |
| Icons | **`lucide-react-native`** + `react-native-svg` | Same icon set as the web (`lucide-react`) |
| Charts and markers | **`react-native-svg`**, hand-drawn like the web | Status markers (half-fill, pause bars, ×) and the one line chart; bars are plain Views |
| Fonts | **`expo-font`** with Geist + Geist Mono (`@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono`) | Splash until loaded |
| i18n | **`i18next` + `react-i18next` + `expo-localization`** | mn default; the device language picks the first one, the user's preference wins after sign-in |
| Haptics, share, clipboard, links | **`expo-haptics`**, React Native `Share`, **`expo-clipboard`**, **`expo-linking`** / **`expo-web-browser`** ("Open in browser") | Small and part of Expo |
| Dates | **date-fns** + shared helpers (calendars are custom grids, as drawn) | No native date picker: every designed picker is a custom month grid with presets |
| Tests | **jest-expo + React Native Testing Library**; **Maestro** for e2e | Shared logic keeps its Vitest tests in `packages/shared` |
