# Fix plan for the usability field test

Source: `docs/review/USABILITY.md` (2026-10-13). Target team: 5–30 people (the spec's size), so findings marked "Large" in the review count only where the fix is cheap or the problem already shows at 30. Sizes: **S** ≤ half a day, **M** 1–3 days, **L** a week or more. Nothing here is implemented yet.

Code was read (not changed) to make the fixes concrete; the notes in *italics* say what the code already has.

## A. Bugs and performance problems with a clear fix

| ID | Problem | Fix | Size |
|---|---|---|---|
| F-03 | Delete says "can be restored later" but nothing restores; the deleted task's page is still editable, its activity 404s. | *API already has `POST /tasks/:id/restore` and returns `deletedAt` on GET.* After delete show a toast with **Undo** (calls restore). When `deletedAt` is set, render the task page/drawer read-only with a "Deleted" banner and a **Restore** button; the row menu shows Restore instead of Delete; the activity feed is served (or hidden) for deleted tasks. | S |
| F-11 | Mark-done from My Tasks: no undo, task vanishes. | *`MyTasksView.tsx` already pushes a toast with Undo on complete.* Verify why the tester saw none (Toaster mounted on that route? duration? does the row's checkbox take the same path?). Then add the same toast to the List checkbox/row menu "Mark done" and to the Board drag into Done. | S |
| F-14 | API outage while navigating leaves a dead "Алдаа гарлаа" page until manual reload. | The route `ErrorBoundary` only resets on pathname change. Wrap it in TanStack `QueryErrorResetBoundary`; the error screen's button resets the boundary and refetches instead of `location.reload()`; retry automatically on `online`/window focus. | S |
| F-24 | Sidebar/UI state leaks between accounts on one browser. | The zustand store persists under one key `kite.ui`. Key it per user (`kite.ui.<userId>`) once `/me` resolves, and drop the entry on logout. | S |
| F-26 | Esc on the drawer pushes history, so Back reopens it. | Close the drawer with `navigate(..., { replace: true })`; keep push only when the drawer was opened from outside the app (no `state.fromApp`). | S |
| F-16 | No skip link; drawer not focus-trapped and focus not restored; status listbox opens on the first option. | Add a "Skip to content" link as the first tab stop. `Drawer.tsx` uses `FloatingFocusManager` without `modal`/`returnFocus` set for trapping; set `modal` (trap) and `returnFocus` to the opener. `Popover` takes `initialFocus`; pickers pass the index of the current value (status, priority, sprint, size). | S |
| F-01 | 300 req/min per IP: 12 people behind one NAT exhaust it (a 30-person office will too). | Key the global limiter by session user id when authenticated, by IP only for anonymous requests; raise the authenticated budget (e.g. 600/min per user) and keep 300/min per IP for anonymous. Make sure `trustProxy` is on behind Caddy so the IP isn't the proxy's. | S |
| F-02 | Login limited to 10/min per IP including successes. | *Failed-attempt throttling already exists (`login-throttle.ts`).* Raise the route's per-IP limit to ~60/min (it only needs to stop floods, not guessing) and show `Retry-After` in the UI message ("try again in 51 s"). | S |
| F-04 | A typed `@Name` that isn't picked from the popup is sent as plain text, no notification. | On submit, walk the doc's text nodes and convert `@<full name>` or `@<unique first name>` of a workspace member into a mention node before serializing (also in descriptions). Anything left as `@text` is rendered dimmed with a tooltip "not a mention" so the author notices. | S/M |
| F-07 | Project List/Board fetch and render every task ever (2.9 MB, 3,000 cards). | *`/projects/:id/tasks` already supports `includeDone`.* Default List and Board to open tasks + done in the last 14 days, with a "Show all done" chip; the Board's Done column shows the recent slice and a "Show N more" button. Raise `pg` gzip/compression on the API (`@fastify/compress`) so even the full payload is ~10× smaller. Paging can wait: a 30-person team rarely has >1k open tasks per project. | M |
| F-25 | Sprints report shows "Carried over 0" after a replan done on the previous sprint's last afternoon. | `carriedQuery` only counts tasks still open in the previous sprint at its end. Count a task as carried when it was in the previous sprint at any time, left it (or the sprint ended) while not done, and is in this sprint. Add a test for "replanned before the end". | S |
| F-28 | Throughput "previous period" line is twelve zeros for a young workspace. | Omit the previous-period series (and its legend entry) when the previous range has no completed tasks and the workspace is younger than the period. | S |
| F-09 (names) | Two people render as "Бат-Эрдэнэ Г." in cells, Workload and activity. | `shortName()` in `packages/shared` is per name. Build short names per list: when two members collide, extend the surname until unique ("Бат-Эрдэнэ Ган.", "Бат-Эрдэнэ Гант."), falling back to the full name. | S |
| F-09 (search) | Picker and search match script-literally ("Bat" ≠ "Бат"). | Normalize both sides with a Cyrillic↔Latin transliteration map (Mongolian standard) plus lowercase/diacritic folding, in the pickers' filter and in `/search` for people. | S |
| F-19 | Native `window.confirm()` for task/comment/space delete. | Replace the three `window.confirm` calls with the existing `Modal` as a confirm dialog (danger button, Esc/Enter). Wording becomes true once F-03 lands. | S |
| X2 | (covered by F-14) | | |

## B. Usability improvements to existing features

| ID | Problem | Fix | Size |
|---|---|---|---|
| F-17 | Default sprint filter hides work; "27 ажил" reads as the whole project. | Count line reads "27 of 139 tasks · Sprint 12–23 Oct ×"; the sprint chip gets the same weight as other filter chips; Board columns show "+N hidden by sprint filter" at the bottom. | S |
| F-21 | Quick create: silent default project, priority behind "Other fields", new task lands outside the current sprint. | Show the pre-selected project as a chip with a dropdown caret (already the last visited, keep it); move Priority next to Assignee/Due in the main row; default the sprint to the project's current sprint when the project has one (chip removable). Priority placement is visual: check `design/CreateTask.dc.html` first. | S |
| F-18 | List rows don't show the task key, duplicates indistinguishable. | Add the key as a toggleable List column (`listColumns` already exists) shown by default, muted, before the title. Visual change not in `design/Main.dc.html`: **needs your OK**. | S |
| F-23 | Project name in a My Tasks row isn't a link. | Make it a link to `/p/:id/list` (stop propagation from the row click). | S |
| F-27 | My Tasks stat cards and "Done this week" aren't actionable. | Each card links to a filtered view: Overdue → My Tasks overdue section, Done this week → a "Done" section on My Tasks (collapsed by default, also fixes recovery in F-11). | S |
| F-32 | Search results show no status/assignee/date. | Add status pill, assignee avatar and project key to each result row; mark deleted tasks. | S |
| F-30 | Tag picker has no inline create. | When the query matches nothing, show "Create tag “…”" as the first option (members can already create tags via Settings?). | S |
| F-20 | "Reassign" is really "add assignee". | In the row/drawer assignee picker, show the current assignees checked at the top with an × on each, and add a "Replace with…" action in the row menu for the single-assignee case. | S |
| F-15 (preset) | Reports Custom period needs typed dates. | Add "Last week" and "Last month" presets to the period picker. | S |
| F-13 | Workload says everyone is "heavy": capacity 15 points vs all open points. | Compare capacity against points **due in the next 14 days or in the current sprint**, not all open work; show "no due date" points as a separate muted segment. This changes a metric definition in `.claude/rules/reports.md`: **needs your OK**. | M |
| F-08 | Search caps at 20, no filters, comments not indexed. | Raise to 50 with "Show more" (cursor), add status/project chips to the palette, and index `comments.text` with a `tsvector` so comment hits open the task at the comment. | M |
| F-29 | Members can create spaces/projects but not archive them. | Let the project's creator (and space creator) archive/delete what they created; admins still handle everything else. Behavior/permissions change: **needs your OK**. | S |
| F-12 (search) | Settings → Members has no search. | Add a name/title filter box above the table and collapse the inline inputs to an edit-on-click row. | S |
| F-31 | Concurrent edits are silent last-write-wins. | *`TaskViewers.tsx` already shows who has the task open.* Show a small "Edited by X just now" line on title/priority when a realtime event changes a field the viewer is editing; refuse to overwrite a title that changed since the editor was focused (keep local text, show "Updated by X — reload"). | M |
| F-10 (light) | No way to tell your projects among many. | Mark projects where the user is a member with a dot in the sidebar and show the existing Favourites section with an empty hint ("Star a project to pin it here"). The full "My projects" view is in C. | S |

## C. New features from "Missing for real work"

| Feature | Size | Now or wait (team of 5–30) |
|---|---|---|
| **Undo toasts on one-click actions** (mark done, sprint move, delete) | S | **Now** (mostly in A: F-03, F-11). |
| **Trash / restore** | S | **Now** as the restore button + toast (A/F-03). A trash list page under Settings can wait. |
| **Watchers: follow/unfollow, mute task, per-project notification level, inbox project filter** | M | **Now.** `task_followers` and `follow()` exist; needed: follow/unfollow endpoints, a follower list + toggle in the drawer, a per-project level (all / mentions+assigned / none) in Settings → Notifications, and a project filter in Inbox. Fixes the "follow a bug I reported" case at any size; the firehose only at 120. |
| **Bulk edit / multi-select** (sprint, assignee, status, due, delete) | L (M if List-only) | **Now, scoped:** multi-select in the List view (checkbox column, shift-click) with a bottom bar for status / sprint / assignee / due / delete, reusing `mutateTasks` in one transaction per action. Board multi-drag and Calendar can wait. Biggest click saver in the review. |
| **Completed-task list per person/period** ("done last week") | S/M | **Now.** Reports → People/My performance: make the "Done N" card open a list of those tasks; My Tasks "Done this week" card does the same (B/F-27). Covers the Monday standup without new screens. |
| **Project description / brief** | S | **Now.** `projects.description` (TipTap JSON) + a collapsible panel under the project header with lead, goal, links. New joiner context for little cost. |
| **Member offboarding: deactivate + reassign open tasks** | M | **Now (simple version).** `workspace_members.left_at`; deactivated members are hidden from pickers and Workload, their sessions revoked; the dialog lists "N open tasks, lead of X projects, reviewer on Y" and offers one reassignment target. Even a 10-person team loses people. |
| **Out-of-office / availability** | M | **Now (minimal), rest later.** Minimal: `away_until` + note on the member, shown as a badge in pickers, Workload and the task drawer. Automatic reassignment or calendar sync can wait. |
| **Search depth** (paging, filters, comment search) | M | Now for comments + "show more" (B/F-08); a full search page can wait. |
| **"Created by me" view / filter** | S | **Now.** A `createdBy` filter chip in List and a "Created by me" section toggle on My Tasks. |
| **"My projects" section / membership in sidebar** | S | Light version now (B/F-10); a dedicated view can wait: at ≤30 people and ~10 projects, favourites plus a membership marker are enough. |
| **Transliterated name search** | S | Now (A/F-09). |
| **Task relations** (link, blocks, parent) | L | **Wait.** Interim: auto-link `KEY-123` in titles, descriptions and comments to the task (S) and show "Mentioned in" on the target drawer. Covers the cross-team request case without a relations model. |
| **Team/department grouping** (Workload, Members, People) | L | **Wait.** Spaces already act as groups for Workload scope; at 30 people a flat list is readable. |
| **Presence/conflict hints on shared edits** | M | Light version now (B/F-31); OT/CRDT merging: wait. |

## Prioritized plan

### Phase 1 — correctness and trust (A items, ~3 days) — **done 2026-10-13, branch `fix/phase-1-trust`**

Notes: F-01/F-02 resolved by removing per-IP rate limiting entirely (decision: the failed-attempt login throttle is the only limit; its Retry-After now shows on the sign-in form). F-03 chose "no confirm + Undo toast" for task deletes; ConfirmDialog replaced `window.confirm` only for comment and space deletes (F-19). F-25 redefined carried-over (see `.claude/rules/reports.md`). F-09 covers pickers, filter menu, @-suggestions and workspace search, plus distinct short names in List cells, the drawer and the Workload/Aging/Carried tables (activity/feed lines still use the plain short form).

1. F-03 delete → Undo toast + Restore button + read-only deleted state.
2. F-11 verify the My Tasks undo toast; add it to List/Board mark-done.
3. F-19 confirm modal replaces `window.confirm`.
4. F-14 error boundary retry without reload.
5. F-24 per-user UI store key; F-26 replace-navigation on drawer close.
6. F-16 skip link, drawer focus trap + return focus, pickers open on the current value.
7. F-04 resolve typed @mentions on send.
8. F-01 / F-02 rate limits keyed by user; login limit raised; retry-after in the message.
9. F-25 carried-over query; F-28 hide empty previous period; F-09 unique short names + transliterated matching.

Commit after each numbered item; all are independent.

### Phase 2 — scale and clarity (A/B items, ~3 days) — **done 2026-10-13, branch `fix/phase-2-scale`** (off `fix/phase-1-trust`)

Notes: decisions taken: F-07 open + done in the last 14 days (`doneSince`, `?done=all` shows everything); F-13 load = points overdue, due within 14 days or in a current sprint (`loadPoints`, rest drawn as "Not due soon"); F-29 creator may archive/restore their project and delete their empty space (migration 0007 `created_by`, null for older rows = admins only); F-18 key column, F-21 Priority + Sprint chips, F-27 Done section and F-15 Last week / Last month segments approved as visual additions (`docs/design-notes.md` §2.7). Corrections found on the way: Caddy already compresses (`encode zstd gzip`), so no `@fastify/compress`; quick create never remembered the last project (it now does, outside a project page); tags couldn't be created in the UI at all; search leaves deleted tasks out, so nothing to mark. F-17's sprint chip already used the shared `FilterChip`, so the change is the "N of M" count and "+N hidden by filters". F-12 got the search box only (inline inputs kept). Seeds leave `created_by` null.

1. F-07 open-tasks-first loading (List, Board) + compression.
2. F-17 sprint filter count/chip; F-21 quick-create defaults (sprint, priority placement, project chip).
3. F-18 key column (pending OK), F-23 project link, F-27 actionable stat cards + Done section on My Tasks, F-32 richer search results.
4. F-30 inline tag create, F-20 replace-assignee action, F-15 "Last week" preset, F-12 members search.
5. F-13 workload metric (pending OK), F-29 creator can archive (pending OK).

### Phase 3 — features worth building now (C, ~2 weeks) — **done 2026-10-14, branch `fix/phase-3-features`** (off `main`)

Notes: decisions: all seven items; offboarding = deactivate (`workspace_members.deactivated_at`, `activeMember` guard everywhere, handover to one successor, reactivate / re-invite brings them back, sessions kept); notifications = drawer follow toggle + per-project level (all / direct / none) + inbox `?project=`; references = render-time links + `task_references` backfilled table for "Mentioned in"; out-of-office set by self or admins, Workload shows Away; bulk edit on the project List only (status, sprint, assignees add/replace/remove, due, priority, delete) with one Undo; title conflicts keep your text with "Use theirs" (no server versioning). Migrations 0008–0013. Also fixed on the way: dark-mode danger buttons (white on #f87171, 2.8:1) now use `--on-danger`. Not done: per-task mute (unfollow covers it), opening a reply that sits in a collapsed thread from ⌘K (scrolls only to visible comments), notification for references.

1. Watchers: follow/unfollow, per-project notification level, inbox project filter (M).
2. Bulk edit in the List view (M).
3. Completed-task lists behind the Done cards (S/M) and "Created by me" filter (S).
4. Project description (S).
5. Member deactivation with reassignment (M); minimal out-of-office badge (M).
6. Comment search + "Show more" (M); light edit-conflict hint (M).
7. Auto-link `KEY-123` in text (S).

### Later / wait

Task relations model, team/department grouping, trash page, full "My projects" view, search page, automatic away handling, conflict merging.

## Decisions needed from you

- ~~F-18, F-13, F-29, F-07~~: decided 2026-10-13 (see Phase 2 notes). ~~F-01~~: resolved in phase 1 (no per-IP limit).
- ~~Phase 3 scope~~: all seven built (2026-10-14). Remaining items are under "Later / wait".
