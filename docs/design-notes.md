# Kite Tasks — design notes

Extracted from `design/*.dc.html` in Phase 0 (2026-10-08). The designs are the visual source of truth; read the relevant section before building a screen. Appendix A has every color/size pulled from the files.

## 0. Decisions (Phase 0 Q&A)

| Topic | Decision |
|---|---|
| Visual conflicts | Design files win on any visual value (color, size, spacing, radius, shadow, typography); CLAUDE.md is updated to match. Non-visual conflicts → ask. |
| Mongolian copy | Only `Main.dc.html` has `STR.mn`. Claude drafts mn for the other screens in Phase 8 and lists new keys in `docs/i18n-review.md` for review. Glossary: Appendix B. |
| Project visibility | Every workspace member sees and edits every project. `project_members` = the project's team (avatar stack, suggested assignees/mentions first). |
| Colors | Palette keys in `users.avatar_color`, `spaces.color`, `projects.color`, `tags.color` (replaces `color_bg/color_fg`). Frontend maps key → exact light/dark values (Appendix A). |
| Default statuses | `statuses.name` nullable. Null → UI shows the translated default for the category (Хийх / To Do …). Renamed → stored name. |
| Role hints | `workspace_members.title` (nullable), e.g. "Eng lead", "QA". "You" is computed. |
| Week chart (My Tasks) | Current week Mon–Sun. "+N vs last week" compares Mon→today with Mon→same weekday last week. |
| In scope (not in original phases) | Notification settings (`users.notification_prefs`), space-level List/Board (`/s/:spaceId/list|board`), online presence dots (WS presence). |
| Out of scope v1 | Import from CSV → button rendered disabled with "Coming soon" tooltip. |
| Reports metrics (2026-10-11) | The metric definitions in CLAUDE.md "Reports" are the agreed drafts (no external R2 spec); revise there if they change. |
| Reports: sprints | (Revised 2026-10-19: shared sprints.) Sprints belong to the **workspace** and cover a set of projects (`sprint_projects`), so one sprint can run across several projects, as the design's "Project: All" and its carried-over rows from APP / CHK / Q4 imply. The Sprints tab lists the sprints covering a project in scope; "Project: All" counts every project of the sprint in scope, picking a project narrows the numbers to its tasks. `number` is a workspace sequence ("Sprint 14"). |
| Reports: reviewer | `tasks.reviewer_id`: entering review without one sets the person picked in the UI, else the project lead (`projects.lead_id`). The drawer shows a Reviewer row (not drawn) while the task is in review. Review turnaround is credited to `reviewer_id`, else to whoever moved the task out of In Review. |
| Reports: capacity, working days | Per person: `workspace_members.capacity_points` (default 15 points per 2 weeks), editable by admins in Settings → Members next to the job title. Working days are Mon–Fri minus `workspace_holidays` (2026 Mongolian public holidays seeded). |
| Reports: defaults (not designed) | Insight boxes only where drawn (Where work waits, burndown). Sizes only S/M/L/XL = 1/3/5/8 (the Workload sample's 2-point tasks are not reproducible). Unsized tasks count 0 points, shown as "N unsized". A task with several assignees counts in full for each. Reports compute live; "Updated N ago" = server `generatedAt`, refetched every 5 min and on focus. Seed makes Bat an admin, so People (admins) and My performance (members) can both be shown. The List view's Size column (toolbar "Columns" menu) and the quick-create Size chip are not drawn; they reuse the Workload size chip and the CreateTask field chip. |
| Reports: Overview UI (2026-10-12) | Workload is open to every member (tab shown to all); People ↔ My performance redirect by role. Aging shows 6 rows; "View all" expands in place (`?aging=all` → API `agingLimit=all`). The throughput "insight" is the figure's aria-label summary (none is drawn). Custom period = From/To popover under the segmented control (not drawn). No Sparkline (no design uses one). Empty state names the scope (project, else space, else workspace); "Go to project" only for a project. Mongolian "N-аас/-оос" suffixes come from `mnFrom()`. |
| Reports: Sprints & Workload UI (2026-10-12) | Neither tab uses the "< 5 completed" gate (they aren't about history); Sprints shows "No sprints in {project} yet" / "No projects to report on", Workload "No one to show". Sprints (revised 2026-10-19): the project filter has its "All" row; picking a sprint writes only `?sprint=`; changing the scope keeps the sprint while it covers a project of the new scope, else clears it. Future sprint banner: "Starts {date} · N working days". **Replan** (not drawn; only the chip is): a 28px outline button in the empty right slot of the Carried-over header plus an accent link at the end of the burndown insight, current/future sprints only → `/p/:id/list?sprint=…&status=<open status ids>` when one project is in view (narrowed, or the sprint covers one), else the space List `/s/:id/list?sprint=…&status=todo,in_progress,review` (across spaces: the space holding most carried tasks); tasks move out through the drawer's Sprint picker. Workload: one bar scale for all rows = max(25, the largest open size or capacity × 1.2, rounded up to 5), ticks every 5 (every 10 above 40); the capacity marker is drawn per row at that person's capacity; when capacities differ the team line and footnote drop "(15 points)". Sort lives in `?sort=overdue`; expanded rows are local. Each expanded task row ends with a 24px person icon button ("Reassign APP-142") opening the assignee picker (toggle, like everywhere); bars move optimistically and roll back on error. "+ Assign work" opens quick create with that assignee (and the filtered project). Unsized tasks show "—" in the size chip. Sprint cards are their own component (gap 6, padding 14 16), not StatCard. |
| Reports: People & My performance UI (2026-10-12) | Workload stays open to members; the e2e test checks People → My performance instead. Stat cards compare with the previous period only (as drawn); the team median is the dashed line in the two trends. "as reviewer" goes in the review card's line ("9 reviews as reviewer · previous: 2.1"). Both tabs use the `< 5 completed` gate. The partial current week keeps the solid dot and adds "This week is still in progress" to the tooltip; a week without a cycle time breaks the line (an isolated week is a 6px point). Not drawn: "No mentions this period", "None answered yet", "No one yet", "No open tasks", "No due dates this period"; reply time "<1h" under an hour and days from 24h. The open-tasks due column is 168px, not 120/140, because "10-р сарын 10 · хэтэрсэн" needs it. Helping tiles auto-fit (≥150px) instead of a fixed 3-column grid so long Mongolian labels wrap inside. The person picker lists every workspace member (40px two-line options, `Picker tall`); the URL carries the person (`/reports/people/:userId`), and no id means the caller. Charts: every figure has an sr-only data table besides its summary sentence. Route tabs use roving tabindex with ←/→/Home/End. |
| Standups (2026-10-16) | Standup content (posts, items, blockers, replies, reactions, posting times, late marker, meeting notes) is **never** used in Reports or any performance metric. The rest of the feature is a proposal: §5. |
| Accessibility contrast (2026-10-12) | axe (WCAG AA) flagged three drawn colors; changed with sign-off: accent ink in light mode is the accent nudged darker (#6E56CF → #6C55CC, #2F6FEB → #2A63D2, #0F766E → #0F756D) so accent text on accent-soft over the sidebar reaches 4.5:1; done due dates use the muted tone (#6B6B74 / dark #8E8E98, drawn #A1A1AA / #5E5E68); out-of-month calendar day numbers and done My Tasks titles use `--text-muted` instead of `--text-faint`; done calendar pills keep the strike-through at full color instead of 65% opacity. |

## 1. Screens

### 1.1 App shell + List — `Main.dc.html`
**On screen**
- **Sidebar** (248px, min 220): workspace button (accent "K" tile, "Kite Studio", ⇅) + collapse; search field with ⌘K kbd; My Tasks (open count), Inbox (accent unread badge); "Spaces" + new-space button; space tree (chevron, 18px space badge, name) → projects (6px dot; active = accent-soft bg, accent text, accent dot); footer: Language МН/EN segmented, Invite teammates, Settings, me (avatar, full name, online dot).
- **Rail** (56px): K tile, expand, search, My Tasks, Inbox, divider, 22px space badges, МН/EN cycle button at bottom.
- **Top bar** row 1 (min 56px): breadcrumb (space badge + space › **project**), favorite star; right: member stack (4 × 26px + "+3"), Share, project options (…). Row 2: tabs List/Board/Calendar (40px, accent underline) + toolbar: Filter (count badge), Sort: Due date, Group: Status, divider, + New Task.
- **Filter strip**: removable chip "Sprint: 10-р сарын 6 – 24" / "Sprint is Oct 6 – Oct 24"; summary "16 tasks · 4 done".
- **Table** (min 960px, scrolls horizontally): grid `40px | 1fr | 152 | 120 | 112 | 224 | 40`, header 36px. Groups by status (To Do, In Progress, In Review, Done; Done collapsed by default): header 40px = chevron, status dot, label, count, +. Rows 44px (36 compact): checkbox (built as a status marker picker, see List view below) · title (+ ↳ "3/5" subtasks, 💬 count) · avatar + name · due (tone) · flag + priority · tag chips (clipped) · "…" (shown on hover/focus). "+ Add task" closes each group. List is sorted by due date.

**Interactive**: collapse sidebar/spaces, switch language, switch view, collapse groups, toggle complete (strike-through, summary recount), open task (→ drawer), add task, filter/sort/group, favorite, share, row menu.

**Data**: me (name, initials, avatar color, locale, presence); workspaces; sidebar tree (spaces → projects, positions); My Tasks open count; inbox unread count; project (space, name, key, favorite, member count + first 4); sprint filter; tasks (key, title, status, position, assignees, due, priority, tags, subtask done/total, comment count, done); totals.

### 1.2 List, dark — `ListDark.dc.html`
Same screen in dark theme; reference for all dark values (Appendix A). Its column widths (`112 | 104 | 232`) and simplified sidebar differ from Main — use Main's layout, take only colors from here.

### 1.3 Board — `Board.dc.html`
**On screen**: shell; toolbar shows "Sort: Manual", "Columns: Status"; filter strip + summary. Columns (flex `1 0 264px`, gap 16, row min 1100px): panel #F7F7F8, border #EFEFF2, radius 12, padding 8, gap 8. Header 36px tinted by category (To Do #EDEDF0 · In Progress #FDF0DC/#92400E · In Review accent-soft/accent · Done #E3F4E8/#166534): dot, title 13/600, white count badge, +, … menu. Cards (radius 10, padding 12, gap 10, hover border #D4D4D8): [green check if done] title 14/500 (done → #6B6B74, no strike) + priority flag; tags (max 2 + "+N"); footer 12px: 📅 due (overdue "Oct 7 · Overdue" #C42B1C/600, today #B45309), ↳ "2/5" + 32×4 bar (accent, green when complete), spacer, avatar stack 24px. "+ Add task" at column bottom. Order = manual `position`.

**Drag state**: source = ghost (opacity .4, dashed border, no shadow); overlay card rotate(2.5deg), accent border, `--shadow-drag`, cursor grabbing; target column border accent+66; placeholder 116px, 2px dashed accent, accent-soft bg, "Drop to move to In Review".

**Interactive**: drag within/between columns (keyboard too), open card, add per column, column menu, filters shared with List.
**Data**: tasks per status by position with assignees (many), tags, subtask counts, due, priority, done; project statuses.

### 1.4 Task detail drawer — `TaskDetail.dc.html`
**On screen**: view behind dimmed (scrim rgba(24,24,27,.28), click closes). Drawer right, 40% width, min 520px, border-left, `--shadow-drawer`, scrolls. Sticky header 56px: `App Redesign › APP-142` (key Geist Mono 12px), Mark complete (secondary + ✓), copy link, open full page, …, divider, ×.
Body (padding 24, gap 24):
- **Title** textarea 22/30/600 (transparent border → hover border → focus accent). Meta "Created by Anu B. on Oct 1 · Updated 2 hours ago".
- **Properties** (label col 112px, rows 36px): Status (outlined button dot+name+chevron → 220px listbox, ✓ on current), Assignees (pill chips: avatar 22 + name; dashed round +), Due ("Today, Oct 8" in tone + "· Started Oct 4" muted), Priority (flag + label), Tags (chips + +).
- **Description** TipTap; focused = accent border + `--ring-soft`; toolbar: Text ▾ │ B I S code │ bullets, numbers, link, @. Content: p, h4, lists, inline code (Geist Mono 12, #F4F4F5), links (underlined), mention chips (accent-soft bg, accent text).
- **Subtasks**: "Subtasks 5/6" + bar (max 160px; accent → green at 100%); bordered list radius 10, rows 40px: checkbox, text (done → muted strike), due (open only), avatar 22; last row "Add subtask" input.
- **Attachments** "3" + Attach: 2-col grid; image card (88px preview, name, "248 KB · Dorj E."), file card (36px type badge, PDF #FDECEC/#B42318), dashed dropzone "Drop files or browse".
- **Activity** (border-top): segmented All / Comments / History. History: 8px marker (grey #C4C4CC; colored by new value — urgent red, review accent, subtask done green), sentence with bold actor/values and status pills, time right. Comment: avatar 24 + bordered bubble radius 10 (name, time, … menu, body with mention chips, Reply, "1 reply").
- **Composer**: my avatar + focused editor; @-suggestions above ("People"; avatar, name, role hint; active row accent-soft); footer: attach, @, "⌘ Enter to send", Comment (primary 30px).

**Interactive**: status picker, subtask toggle, activity tabs; also edit title/description, all property pickers, add subtask, upload/download, comment/reply/mention, mark complete, copy link, full page, close (Esc/scrim/×).
**Data**: task detail (key, project, creator, created/updated, status, assignees, start/due, priority, tags, description JSON); subtasks (assignee, due, done, position); attachments (filename, mime, size, uploader); merged activity + comments with reply counts; project members with titles; project statuses.

### 1.5 My Tasks — `MyTasks.dc.html`
**On screen**: sidebar My Tasks active (accent-soft, 600). Header "My Tasks" + All spaces filter, Group: Due date, + New Task. Left: "Thursday, October 8", h1 24/32 "Good morning, Anu". Stat cards (auto-fit ≥200px, radius 12, padding 16): **Due today** "3 · of 4 left · 1 urgent" (clock #B45309); **Completed this week** "7 · +3 vs last week" (#166534) + 7 bars Mon–Sun (8px, h=max(4, n·8) in 32px; past accent 40%, today accent, future #E6E6EA; aria-label lists counts); **Overdue** danger card (border #F3D3CF, bg #FFF8F7, value #C42B1C, "oldest is 2 days late"). Sections (min 640px): Overdue (red label, #FDECEC/#B42318 count, hint "Reschedule or close these first"), Today ("Thursday, Oct 8"), This Week ("Fri, Oct 9 – Sun, Oct 11"), Later ("After this week"); header 40px chevron + label + open count + hint; rows grid `32 | 1fr | 168 | 100 | 88` 44px: checkbox (built as the List's status marker, see List view below), title, 16px space badge + project, due (section tone; "Fri, Oct 9" style in This Week), priority; "+ Add task" per section. Right panel (max 360, radius 12) "Recent activity" + "View inbox": avatar, "**Dorj E.** mentioned you in **task**", optional quote box (#F7F7F8, one line), "2h ago · App Redesign", unread accent dot; "Show older activity".

**Interactive**: complete (counts + stats update, row stays struck through in place), collapse sections, open task, add task (quick create prefilled: me + section due date), space filter, group, feed links, pagination.
**Data**: `GET /me/home` — my open tasks + today's completed ones, with project + space; stats; per-day completions Mon–Sun; activity on my/followed tasks with unread flag; first name + time-of-day in my TZ.

### 1.6 Calendar (space level) — `Calendar.dc.html`
**On screen**: sidebar space row active (accent-soft, accent 600); projects with 8px project-color dots. Header: "P Product › All projects", Share, space options; tabs List/Board/Calendar (all three exist at space level); Filter, + New Task. Toolbar: Today, ‹ ›, title 18/24 "October 2026" (week: "Oct 5 – 11, 2026"), Month/Week segmented, project toggle chips (dot + name; off = 50% opacity + strike, aria-pressed). **Month** (radius 12, min 700px): weekday header 32px #FAFAFB, Monday first, cells min 128px: day number (24px; today = accent circle white text; other month #A1A1AA; "Oct 1" on the 1st), pills 22px (project bg/fg, 6px dot, ellipsis; done → strike + 65% opacity); >3 tasks → 2 pills + "+N more" → day popover ("Thursday, Oct 8", ×, all pills 26px with project name). Weekend #FCFCFD, other month #FAFAFB, cell borders #EFEFF2. **Week**: 7 columns min 620px, header 44px (weekday + 26px number), stacked cards (title 12/16, dot + project + assignee initials). **Unscheduled** panel (max 288, #F7F7F8, radius 12): title + count, +, filter input, hint "Drag a task onto a date to schedule it", draggable cards (grip, title 13/500, project dot + name, flag); empty "Everything is scheduled."
**Drag**: source card 50% + dashed accent; target cell accent-soft + inset 2px accent ring + dashed ghost pill with the title.

**Interactive**: Today/prev/next, Month/Week, toggle projects, +more popover, drag Unscheduled → day (sets due), pill → day (moves due), pill → Unscheduled (clears due), click → drawer, filter, add.
**Data**: space + projects (name, color); tasks with due in visible range (title, key, project, assignee initials, done); open tasks with no due (title, project, priority, assignee).

### 1.7 Quick create — `CreateTask.dc.html`
**On screen**: view dimmed (scrim .32). Modal 600px, 112px from top, radius 14, `--shadow-modal`. Header: project chip (#F4F4F5, dot + name) › "New task", Esc ×. Title 20/28/600 ("Task title"); description ("Add a description… Markdown and @mentions work here"). Field chips 30px: Assignee (avatar + name + kbd A), Due (📅 + label + kbd D), Project (dot + name + kbd P), … more fields; open chip = accent-soft bg + accent border. Pickers 264px, `--shadow-popover-lg`: search (Assign to… / Type a date, e.g. "next fri" / Move to project…), options 32px — assignee: avatar 20, name, role hint/"You", ✓, "Unassigned" (dashed avatar); due: Today · Tomorrow · This weekend · Next week · In two weeks · No due date, each with resolved date ("Fri, Oct 9"); project: dot, name, space. Assignee footer: ↑↓ navigate · ↵ select · ⌫ unassign. Footer: "Create more" switch, Cancel, Create task (kbd ⌘ ↵). Hints bar: A Assignee · D Due date · P Project · ⌘↵ Create · ⇧⌘↵ Create and open.

**Interactive**: A/D/P open pickers, keyboard nav, create / create & open / create more, Esc/scrim close.
**Data**: projects by space (+ color); members (title, me); first todo status; date presets from today in my TZ.

### 1.8 Empty project — `EmptyProject.dc.html`
**On screen**: sidebar: new project active + "New" badge (white pill, accent text). Header: breadcrumb, single avatar, Share. Tabs; Filter disabled; + New Task. Center (max 560): illustration (ghost rows card, accent + bubble), h1 20/28 "Partner Portal has no tasks yet", body, actions: Create first task (primary 40px, kbd C), Import from CSV (secondary → disabled, "Coming soon"), Invite teammates (ghost). "Or start from a template": 3 cards (28px colored icon tile, name 13/600, desc 12px): Product launch "18 tasks across planning, build and go-live", Sprint planning "12 tasks for a two-week cycle", Bug triage "6 tasks plus priority and severity fields". Seed: Partner Portal has one completed task (Reports needs it for "1 / 5"), so this screen shows for newly created projects, not for Partner Portal.
**Interactive**: create (modal), apply template, invite.
**Data**: project (name, members, task count 0, created_at); static templates.

### 1.9 Inbox (empty) — `EmptyInbox.dc.html`
**On screen**: sidebar Inbox active. Header h1 "Inbox" + Mark all as read (disabled when none unread) + bell icon (notification settings). Tabs All / Mentions / Assigned to me / Archived. Empty state (max 440): 112px circle with inbox icon + green ✓ badge, h2 "You're all caught up", body (mentions, assignments, comments on followed tasks; read → Archived after 30 days), Go to My Tasks (primary), Notification settings (secondary), "View 24 archived notifications", tip "press G then I".
**Interactive**: tabs, mark all read, notification settings, archived link, G-then-I chord.
**Data**: notifications per tab, unread count, archived count. Populated list is not designed → reuse the My Tasks feed row (avatar, actor + verb + task, quote, time · project, unread dot) + hover actions (mark read, archive).

### 1.10 Reports — shared frame (all `Reports*.dc.html`)
Design "today" in every Reports file is **Fri Oct 9 2026** (seed today is Thu Oct 8, so seeded numbers shift one day).
- **Sidebar**: new nav item **Reports** under Inbox (bar-chart icon `M3 3v18h18` + 3 bars); active = accent-soft bg, accent text, 600. Add to the rail too.
- **Header row 1** (min 56px): h1 14/600 with the chart icon (#52525B) + "Reports"; right: **"Updated 5 minutes ago"** 12px `--text-muted` (= server `generatedAt`, relative, ticking). While loading the slot shows a 14px accent spinner + "Loading reports…" (`role=status`).
- **Header row 2**: tabs (40px, 13/500, gap 4, padding 0 10, selected `--text` + `inset 0 -2px 0 accent`, others muted) **Overview / Sprints / Workload / People** (admins/owner) or **… / My performance** (members). Toolbar right (padding-bottom 8, gap 8): period segmented (track `--surface-2`, 28px buttons, 13/500, radius 6) **This week / Last 4 weeks (default) / This quarter / Custom** (built: This week / Last week / Last 4 weeks / Last month / This quarter / Custom, see §2.7); outline filter buttons 32px "**Space:** All ▾", "**Project:** All ▾" (label muted); 1px×20 divider; ghost "⬇ Export CSV".
  - Per tab: Overview = period + space + project + export. Sprints = sprint selector + space + project + export. Workload = space + project + export (no period). People / My performance = period + export (no scope filters; My performance's export reads "Export my data").
- **Range line** (13px muted, first line of content): "Sep 12 – Oct 9 · compared with the previous 4 weeks (Aug 15 – Sep 11)" / mn "9-р сарын 12 – 10-р сарын 9 · өмнөх 4 долоо хоногтой (8-р сарын 15 – 9-р сарын 11) харьцуулав".
- **Content**: padding 20 24 40, gap 24 (Workload 20). Panels: 1px `--border`, radius 12, padding 20 (stat cards 16, or 14 16 on Sprints/People/Mine). Panel heading 15/600 (People/Mine 14/600) + 13px muted subtitle (People/Mine 12px), gap 2.
- **Charts** are hand-drawn (positioned spans + one SVG `viewBox 0 0 1000 H`, `preserveAspectRatio=none`, `vector-effect: non-scaling-stroke`, 2px round strokes). Gridlines 1px #F1F1F3, baseline #D4D4D8, tick labels 11px muted, 32px (28) y-label gutter. Points 8px with a 2px `--bg` ring. Hover = invisible equal-width columns; vertical 1px #D4D4D8 line + tooltip (surface, 1px border, radius 8, padding 8 10, 12px, `0 8px 24px rgba(24,24,27,.10)`, min-width 168, flips near the edges). Every figure has an aria-label summary sentence.
- **Tables** (aging, carried): header 36px `--bg-subtle`, 12/500 muted, borders `--border-subtle`; rows 48px, `.trow` hover `--bg-subtle`, the whole row is a link to the task drawer; horizontal scroll under min-width 860.

### 1.11 Reports · Overview — `Reports.dc.html`
- **Stat cards** (grid auto-fit ≥220px, gap 12; label 13px #52525B with a 14px icon; value 28/32 600 + unit 13px; footer 12px muted):
  - **Completed** (green check) "142" "· 386 points" + delta chip "↑ 12%" "vs previous period".
  - **Median cycle time** (accent stopwatch) "3.2 days" + chip "↓ 0.6 days" "lower is better".
  - **On-time delivery** (#0284C7 calendar-check) "87%" "124 of 142" + chip "↑ 4 pts" "vs previous period".
  - **Overdue** danger card (border #F3D3CF, bg #FFF8F7; warning icon #C42B1C; value #C42B1C) "5 tasks", footer "Oldest is 6 days late" (#C42B1C 500). Current snapshot, not period-bound.
  - Delta chip: 20px, padding 0 6, radius 6, 12/600, 12px arrow. Good = #E8F5EC/#166534 (green whenever the change is an improvement: up for completed/on-time, down for cycle time). Bad: not drawn → danger-soft #FDECEC/#B42318.
- **Throughput** (flex 999 1 560): "Throughput" / "Tasks completed per week · last 12 weeks"; legend 16×2 lines: This period (accent), Previous period (#C4C4CC). 200px plot, y 0–40 step 10, 72px right margin holding end labels ("This period" 12/600 at the last accent point; "Previous period" 12px muted, 14px above the grey line's end). X labels = week starts (Monday) "Jul 20" / mn "7/20". **The last point is hollow** (white fill, 2px accent border) = the current, partial week; its tooltip adds **"This week is still in progress"** / "Энэ долоо хоног үргэлжилж байна". Tooltip title "Week of Oct 5" / "10/5-ны долоо хоног"; rows: dot + series + value (current bold). Hovered dot scales 1.35. In the sample the last 4 weeks sum to 142 (= Completed) and the previous series' last 4 to 127 (→ +12%).
- **Where work waits** (flex 1 1 360): "Median days spent in each status"; rows (gap 16) for To Do / In Progress / In Review: 10px status marker, label 13px, value "4.6 days" 600; 12px bar on a #F4F4F5 track (radius 4) scaled to 5 days; colours To Do #8B8B94, In Progress #D97706, In Review accent. **Insight box** pinned to the bottom (margin-top auto; accent-soft bg, radius 8, padding 10 12, 13/20 #3F3F46, 14px accent info icon): "Tasks wait longest in review — 4.6 days on median, about twice as long as any other status." / "Хянагдаж буй ажлууд дунджаар 4.6 хоног хүлээж байна — бусад төлвөөс 2 дахин урт." Built client-side: the slowest category and its ratio to the next slowest. There is **no** insight under Throughput.
- **Aging tasks** (full width, overflow hidden): "Aging tasks" / "Flagged when a task has been in its current status for more than 5 days" + "View all" (accent 13/500). Grid `minmax(0,1fr) 176 160 148 184`: Task (500, ellipsis) · Project (8px project dot + name 13px) · Assignee (24px avatar, 10px initials, short name) · Status (10px marker + name) · **Days in status** (right). Sorted by days desc. When > 5 days: **"Stale"** chip (22px, radius 6, #FEF3E2/#92400E, 12/600, warning icon) + days in #92400E 600; otherwise #3F3F46. Sample shows 6 rows incl. a To Do task.
**Data**: period range + previous range; completed count/points (now and previous); cycle-time median (now/previous); on-time count/total (now/previous); overdue count + oldest days late; 12 weekly throughput counts + previous series; median days per non-done category; open tasks with their current status's entered-at, project, assignees.

### 1.12 Reports · Sprints — `ReportsSprints.dc.html`
- **Sprint selector** (toolbar): 32px outline button: ↻ icon, "**Sprint 14**" 600, "Oct 6 – Oct 24" muted, **"Current"** pill (18px, #E8F5EC/#166534, 11/600). Listbox 288px, radius 10, `--shadow-popover-lg`, options 34px radius 6 (name 600 min 72px · range muted · "Current" green · accent ✓; selected row accent-soft), newest first. Filters: "Space: Product", "Project: All" (all the sprint's projects in scope; a project narrows the numbers, see Decisions). Options of a sprint shared by several projects show their keys under the name (not designed).
- **Banner**: h2 18/24 "Sprint 14 · Oct 6 – Oct 24" (mn "14-р спринт · 10-р сарын 6 – 24") + 13px muted "**Day 4 of 15 working days · 11 days left**" (past: "Completed sprint · 15 working days"); right: 240×6 bar (#EFEFF2 track, accent fill = elapsed working days). The seed computes sprint dates in working days from today, so Sprint 14 always has 15 working days with today as day 4 (the drawn Oct 6–24 is a Saturday end with 14).
- **Numbering**: "Sprint 14" / "14-р спринт"; short "S14" / "С14".
- **Cards** (auto-fit ≥200, padding 14 16, gap 6; 10px radius-3 swatch + label; value 26/32 600; sub 12px muted):
  - **Committed** 42 (swatch committed colour) — current: "incl. 7 carried over"; past: "at sprint start".
  - **Completed** 11 — current: "24% of scope · slightly behind ideal"; past: "X% of total scope" (scope = committed + added).
  - **Added mid-sprint** "+3" (swatch #D97706) — "Scope +7%" (added / committed).
  - **Carried over** 7 (swatch #8B8B94) — current: warm card (bg #FFFBF5, border #F5DDB8, value #92400E) "from Sprint 13 · 3 carried 2+ times"; past: label **"Carried to next sprint"**, "into Sprint 15", plain card.
- **Committed vs completed** (flex 1 1 480): "Last 6 sprints · number of tasks"; legend 10px swatches Committed / Added mid-sprint / Completed. y 0–50 step 10. Per sprint group: an 18px column stacking committed (bottom, radius 1 1 0 0) + added (top, radius 4 4 1 1, gap 2), and an 18px completed bar beside it (gap 4). Colours with the default accent: committed #9C8BE3, completed #5B45B8; other accents: accent+73 / accent; added #D97706. The current sprint's completed bar is hatched (`repeating-linear-gradient(135deg, c 0 3px, c99 3px 6px)`). Selected sprint's group bg accent-soft (radius 6 6 0 0); hovered #FAFAFB. X labels 11/15: "S14" (selected 600 `--text`) over "83%" / "in progress". Tooltip: "Sprint 13 Sep 14 – Oct 2", Committed / Added (+5) / Completed, "83% done".
- **Burndown** (flex 1 1 480): "Current sprint burndown" / "Remaining tasks per day · Sprint 14" (counts tasks, not points). Legend: Remaining (accent line), Ideal (2px dashed #8B8B94), Projected (2px dotted accent), "+2" chip "Scope added". X = sprint start + each working day; labels only at a few dates. Lines: ideal `6 5` dash committed → 0; projected `2 5` dash from today to the end at the current pace, end label "≈ 12" (11/600 accent, right-aligned); remaining solid with dots up to today. **Today**: vertical 1px dashed #A1A1AA + "Today" 11/600 #52525B above the plot. Scope chips (16px, radius 4, #FEF3E2/#92400E, 10/600) above the remaining point of the day work was added. Tooltip: "Oct 9 · today" / "Sprint start · Oct 6", Remaining or Projected (N tasks), Ideal. Below: warning **insight box** (#FEF3E2, #B45309 warning icon): "At the current pace about 12 tasks will be left when the sprint ends. Consider trimming scope or unblocking tasks in review." Burndown for a past sprint (not designed): title "Sprint 13 burndown", full remaining line, no projection/today.
- **Carried over from last sprint**: "7 tasks moved from Sprint 13 into Sprint 14 · flagged when carried 3 or more times". Grid `1fr 176 160 148 216`, last column "**Times carried**": 3 pips (8px, radius 2, gap 3; filled = times carried up to 3; #D97706 when flagged, #8B8B94 otherwise, empty #E6E6EA) + "N times" (min 72px). Carried ≥ 3 → **"Replan"** chip (Stale chip style) and count #92400E 600.
**Data**: the sprints covering a project in scope (number, dates, current, projects); selected sprint's working days, day index, days left; committed / carried-in (and how many 2+) / completed / added / carried-out + next sprint; last 6 sprints' committed/added/completed; per-working-day remaining + added; carried-in tasks with times carried.

### 1.13 Reports · Workload — `ReportsWorkload.dc.html`
- Intro: h2 18/24 "Team workload" + 13/20 #52525B team line (max 640): "7 people · 27 open tasks · 87 points in total · 12.4 points per person on average. The dashed line marks capacity for the next 2 weeks (15 points)." Right: "Sort by:" + segmented **Open size** (default) / **Overdue**.
- Table (radius 12, min 900; grid `24 200 88 120 minmax(0,1fr) 128`, column-gap 16, padding 0 20). Header (`--bg-subtle`, padding 14 20 10): Person · Open tasks · Size · [legend: Overdue / Due this week / Later / No due date with 10px swatches + tick row 0 5 10 15 20 25] · Capacity.
- Person row (button, min 56px, `aria-expanded`, aria-label "Dorj E., 5 tasks, 15 pts, Heavy"): chevron (rotates 90°) · 28px avatar + name 500 + **job title** 12px muted (from `workspace_members.title`, e.g. "Frontend engineer") · open count (tabular) · size "15 pts" 600 + "8 pts overdue" 12/16 #C42B1C 500 · stacked bar 14px (segments flex by points, gap 2, outer radius 4, inner 1): Overdue #C42B1C, Due this week (today → Sunday) #E39B2B, Later #8B8B94, No due date hatched (`repeating-linear-gradient(135deg,#F4F4F5 0 3px,#D4D4D8 3px 4px)` + 1px #C4C4CC); bar width = points / 25; segment titles "Overdue: 8 pts (2 tasks)". **Capacity marker**: 1px dashed #A1A1AA vertical line at 15 / 25 through every bar. · Capacity pill (22px, radius 11, 12/500, 6px dot).
- **Heavy / Balanced / Light**: Heavy if open points > capacity + 3 **or** overdue points ≥ 5 (#FEF3E2/#92400E, dot #E39B2B); Light if points ≤ 7 (#E8F5EC/#166534, dot #16A34A); else Balanced (#F1F1F3/#3F3F46, dot #8B8B94). Pill title "Capacity for the next 2 weeks ≈ 15 points". With a configurable capacity C the thresholds become C + 20% and ≤ C/2 (15 → 18 / 7). Built: compared with **load points** (due within 14 days or in a current sprint), not all open points; the rest is a dashed-outline "Not due soon" segment (§2.7).
- Expanded row (bg `--bg-subtle`, padding 0 20 16 60): inset card (border `--border-subtle`, radius 10, surface). Task rows 40px, grid `16 1fr 168 120 56`, gap 12, divider #F4F4F5: priority flag · "Title · Priority" (priority muted) · project dot + name · due label in the bucket tone (overdue #C42B1C 500, week #92400E 500, later #3F3F46, none muted) with an 8px bucket swatch ("Today", "Tomorrow", "Oct 20", "No due date") · size chip (20px pill `--chip`, 12/500, title "Size (points)"). Sorted by bucket, then due. Footer (padding 8 14): "3 pts over capacity" / "8 pts of room" 12px muted + **"+ Assign work"** (28px outline, 12/500) → quick create with that assignee.
- Footnote (12/18 muted, info icon): "Size is the sum of story points on open tasks. The capacity marker is a rough per-person amount for the next 2 weeks (15 points) — it is there to help share work fairly, not to rate anyone."
**Data**: capacity; members (avatar, title) with open tasks (title, priority, project, due, size) bucketed by due in my TZ; totals.

### 1.14 Reports · People — `ReportsPeople.dc.html` (admins/owner)
- **Person picker**: 52px button, radius 12, padding 0 12 0 8: 36px avatar (13/600) + name 16/22 600 + **job title** 12/16 muted + chevron. Listbox 280px (popover-lg), options 40px: 24px avatar, name 13/500, title 11/14 muted, accent ✓, selected accent-soft. Next to it: **"Visible to admins only"** chip (24px, radius 6, `--surface-2`, 12/500 #52525B, lock icon). Right: range "Sep 12 – Oct 9 · compared with the previous 4 weeks".
- Note box (bg #F7F7F8, border `--border-subtle`, radius 8, speech icon): "Use these as a starting point for 1:1 conversations, not as a score."
- **5 cards** (auto-fit ≥190) with **neutral deltas** (chip #F1F1F3/#3F3F46; arrow up, down (rotated 180°) or sideways (90°) when equal; never green/red):
  - Completed "14 tasks · 38 pts", chip "↑ 3", "previous: 11 · 31 pts".
  - On-time "79%", chip "↓ 6 pts", "previous: 85%".
  - Median cycle time "3.8 days", chip "↑ 0.4", "previous: 3.4 days".
  - Overdue now "2 tasks", "Oldest is 6 days late" (danger card styling) or "No overdue tasks" (plain).
  - **Review turnaround** "1.6 days", chip, "9 reviews · previous: 2.1"; no reviews → "—", no chip, "No reviews this period".
- **Trends** (grid auto-fit ≥360, gap 16): cards padding 16 20; title 14/600 + "Last 12 weeks"; legend (stacked, right): accent 14×2 series label + dashed #A1A1AA **"Team median"**. 96px plot (40px right margin), baseline #E6E6EA, team median = horizontal 1px dashed #A1A1AA, accent line, one 8px dot on the last (or hovered) point, last value label 12/600 at the right end; x labels only first/last week ("Jul 20" … "Oct 5"). Tooltip (padding 6 8, `0 8px 20px` → normalised to the chart tooltip shadow): "Week of Oct 5  **3 tasks**". Cards: **Completed per week** (series "Completed") and **Cycle time** (series "Median (days)").
- **Helping others** ("Contributions on other people's tasks · last 4 weeks" — follows the period): 3 tiles (grid of 3, gap 12; padding 12, radius 10, `--bg-subtle`; 32px accent-soft icon tile; label 12/16 #52525B, value 20/26 600, sub 12/16 muted): **Comments on others' tasks** 9 "previous: 23" · **Subtasks done on others' tasks** 6 "across 4 tasks" · **Mentions answered** "11 / 12" "**Median reply time 2h**" (mn "Хариулах медиан хугацаа 2ц"). Side list (flex 1 1 240) **"Worked with most"**: up to 3 rows (24px avatar, name, "8 times").
- **Current open tasks**: heading row 40px (14/600 + count badge + "See workload" accent link → Workload tab), bottom border; rows 44px, grid `28 1fr 176 136 120 96` (min 760): 10px status marker · title · project dot + name 12px · status 13px · due ("Oct 3 · overdue" #C42B1C 500, "Today" #B45309 500, else #52525B; "No due date") · flag + priority. Sorted by due.
**Data**: members with titles; per person: period + previous completed (count, points), on-time %, cycle median, overdue now + oldest, review turnaround + count; 12 weekly completed counts and weekly cycle medians + team medians; helping counts; worked-with top 3; open tasks.

### 1.15 Reports · My performance — `ReportsMine.dc.html` (members)
Same blocks as People, for the caller, with "you" copy. Tab **"My performance"** / "Миний гүйцэтгэл" replaces People; the person picker becomes a header: 44px avatar + h2 20/28 period title (**"Your last 4 weeks"** / "Your week so far" / "Your quarter so far" / "Your chosen period") + 13px muted "Anu Bold · Product manager · Sep 12 – Oct 9"; right: privacy pill (26px, radius 13, `--surface-2`, lock) **"Visible only to you and workspace admins"**. Note box is accent-soft with an accent icon: "This is a look at how your work has been flowing. Use it to prepare for 1:1s or spot what you might want to change — it is not a score." Card copy: "Completed … before: 8 · 19 pts", Overdue "2 days late — set a new date?", **"Your review turnaround"** "11 reviews by you · before: 1.5", none → "Nothing overdue". Trend series "You" / "You (days)". Helping: "How you helped others" / "Your contributions on other people's tasks · last 4 weeks", Mentions "19 / 19" "All answered · median reply 1h", list "People you worked with most". Open tasks: "Your open tasks" + "Go to My Tasks" (due column 140px). Export: "Export my data".

### 1.16 Reports · Empty — `ReportsEmpty.dc.html`
Shown for a scope (here Project: Partner Portal) with **fewer than 5 completed tasks** (all time). Header: no "Updated", toolbar only the Project filter + disabled Export (`--text-faint`, not-allowed). Center column max 640, padding 56 24 48, gap 24:
- Illustration 320×148 card (border, radius 14, padding 16 16 12 28): axes #E6E6EA, dashed guides #EFEFF2, one solid accent bar (18×22) + 4 dashed #D4D4D8 ghost bars, two 40×6 #F1F1F3 label pills, 36px clock badge (accent stopwatch) at top-right (−12px) with a 4px `--bg` ring.
- h2 20/28 "Reports appear after your team completes a few tasks" + body 14/22 #52525B: "Partner Portal is new, so there isn't enough history to show trends yet. Once the team finishes 5 tasks, throughput, wait times and the other reports will show up here automatically."
- **Progress card** (max 400, padding 14 16, radius 12): "Toward your first report" 13/500 + "**1** / 5"; 5 segments (6px, radius 3, gap 4; done accent, rest #EFEFF2; `role=progressbar` 0–5); hint "1 task completed so far · 4 more to go".
- Actions: **Create a task** (primary 40px, + icon → quick create in the project), **Go to project** (secondary 40px), **See reports for all projects** (ghost → clears the project filter).
- "What you'll see" (border-top `--border-subtle`, margin-top 16, padding-top 24): 3 preview cards (auto-fit ≥170, padding 12, radius 10, border `--border-subtle`, `--bg-subtle`; 28px accent-soft icon tile; title 13/600; desc 12/16 muted): Throughput · Where work waits · Aging tasks.

### 1.17 Reports · Loading — `ReportsLoading.dc.html`
Frame renders immediately: tabs live, period segmented visible but inert (inactive labels #A1A1AA), Export disabled, header status "Loading reports…" with a spinning accent arc. Content `aria-busy="true" aria-live="polite"` + sr-only "Loading reports…": a 420px (max 70%) 12px range bar; 4 card skeletons (border `--border-subtle`, faint real labels, 96×28 value, 12px footer bar); throughput placeholder as **12 bars** (heights 40–78%) over 4 faint gridlines, 4 x-label pills; waits placeholder (3 label/value pairs + bars 30/45/90%, 44px insight block); aging table (faint heading, 36px empty header, 5 rows of grid `1fr 176 160 148 120` bars incl. 24px avatar circles). Skeleton `.sk`: `linear-gradient(90deg,#F1F1F3 25%,#E7E7EB 37%,#F1F1F3 63%)` 400% wide, 1.4s ease-in-out shimmer; reduced motion → static #F1F1F3.

### 1.18 Task detail · Size — `TaskDetail.dc.html` (updated)
New property row after Priority: 14px tag-ruler icon + "Size". Control: radiogroup "Size" (track `--surface-2`, padding 2, gap 2, radius 8) with 4 buttons **S / M / L / XL** (min-width 36, 28px, padding 0 8, radius 6, 12/600; selected surface + `--shadow-segment`, others #52525B transparent), followed by a 12px muted hint **"= 5 points · used in Workload and Throughput reports"**. Button titles: "S = 1 point · Small · about half a day", "M = 3 points · Medium · 1–2 days", "L = 5 points · Large · 3–4 days", "XL = 8 points · Extra large · about a week, consider splitting". No mn strings in the design (draft them). Unsized (not drawn): no button selected, hint "No size · used in Workload and Throughput reports"; clicking the selected size clears it.

## 2. Gaps vs the data model

### 2.1 Schema changes (decided; CLAUDE.md updated)
| Need (where) | Change |
|---|---|
| Dark variants of avatar/space/project/tag colors; project bg/fg/dot triple (ListDark, Calendar) | Palette keys: `users.avatar_color`, `spaces.color`, `projects.color`, `tags.color` (drop `color_bg/color_fg`). |
| Bilingual default status names | `statuses.name` nullable → translated by category. |
| Role hints (TaskDetail mentions, CreateTask assignee picker) | `workspace_members.title` nullable text. |
| Notification settings (Inbox) | `users.notification_prefs jsonb` `{mention, assigned, comment, status}` booleans, default true; checked during fan-out; UI in `/settings`. |
| Online dots, task viewers | Not stored. The WS server keeps presence in memory (`apps/api/src/realtime/hub.ts`); the web keeps it in `stores/realtime.ts`. |
| Task size (TaskDetail, Workload, Completed points) | `tasks.size` nullable enum `S\|M\|L\|XL`; points via shared `SIZE_POINTS` {S:1, M:3, L:5, XL:8}; activity `size.changed {from,to}`. |
| Time in status (cycle time, waits, aging, burndown) | New `task_status_periods` (one open row per task), written with every status change; backfilled from `activity`. |
| Sprint history (committed / added / carried) | New `sprint_memberships` (one open row per task), written wherever `tasks.sprint_id` changes; backfilled from `sprint.changed` + current `sprint_id`. |
| "Sprint 14" | `sprints.number` (per-workspace sequence; sprints are shared by the projects in `sprint_projects`); `sprints.name` nullable (null → "Sprint {n}" / "{n}-р спринт"). |
| Capacity marker (Workload) | `workspace_members.capacity_points` int default 15 (per person). |

### 2.2 Derived (computed in queries, never stored)
- **Sidebar**: My Tasks = my open tasks (not done, not deleted) in workspace; Inbox = unread, unarchived notifications.
- **Project**: member count + first 4 for the stack ("+N"); "New" badge = created ≤ 7 days ago.
- **List/Board**: group/column counts, "N tasks · M done" (after filters), subtask done/total, comment count, Board tag "+N".
- **Task**: key = `projects.key-number`; "Updated 2 hours ago" from `updated_at`; reply count via `parent_id`; attachment count.
- **People**: short name "Anu B." (first + last initial), first name for greeting, full name in sidebar footer — all from `users.name`.
- **Due tone** (user TZ): overdue (< today) · today · soon (tomorrow → Sunday of current Mon–Sun week; tomorrow always soon) · later · done.
- **My Tasks**: sections overdue / today / this week (tomorrow–Sunday) / later (after Sunday, then no-due tasks last); stats due-today open/total/urgent, completed this week (my tasks with `completed_at` Mon–Sun) + delta, per-day counts, overdue count + oldest days late; feed unread = my notification for that `activity_id` unread.
- **Inbox**: archived count. **Calendar**: unscheduled count, "+N more".
- **Reports**: every metric is computed per request from tasks, `task_status_periods`, `sprint_memberships`, comments, subtasks and activity (definitions: CLAUDE.md "Reports"); the API caches each computed report for 5 minutes per process and drops a workspace's reports on any of its task events, so `generatedAt` ("Updated N minutes ago") is at most 5 minutes old. Text built on the client from numbers: range line, deltas ("↑ 12%", "4 pts", "0.6 days"), the waits insight (slowest category; ratio to the next slowest → "about twice" (≥1.75), "about N times" (rounded, ≥2.5), else "X days longer"; hidden when fewer than 2 categories have data), the burndown insight (shown when projected remaining > 0; the second sentence names the slowest status), pace ("slightly behind ideal"), capacity foot notes, "N times", "Median reply time 2h".
- **Activity lines + marker colors** from `activity.type` + payload. Payload snapshots display data so renames/deletes don't break history: `status.changed {from:{id,name,category}, to:{…}}`, `priority.changed {from,to}`, `due.changed {from,to}`, `assignee.added/removed {user:{id,name}}`, `attachment.added {attachmentId, filename}`, `subtask.completed {subtaskId, title}`, `comment.added {commentId}`. Full set (phase 5): `activityPayloadSchemas` in `packages/shared/src/schemas/activity.ts`.

### 2.3 UI state (not in DB)
URL: view, filters, sort, group, `?task=KEY`. localStorage: sidebar collapsed, open spaces, collapsed groups per project, calendar mode + hidden projects, "Create more", last workspace.

### 2.4 Behaviour defaults (not designed; override anytime)
- List assignee cell with >1 assignee: stacked avatars + "Anu B. +1". Board shows the full stack.
- Quick create sets one assignee; more via drawer.
- Priority `none`: outline flag #D4D4D8 + muted "No priority".
- Calendar uses `due_date` only (no start→due spans). Done tasks stay on the calendar, never in Unscheduled.
- Image attachments: original via authenticated URL, `object-fit: cover` (no thumbnails v1); other files: type badge from extension.
- Space-level List/Board: same components; columns/groups = the 4 status categories (statuses are per project); project name shown on each row/card.
- Favorite on: filled star (#CA8A04).
- Dark popovers: option hover uses `--surface-2` (since `--hover` = `--surface` in dark).
- Active sprint filter (phase 8): opening a project with no filter params applies `?sprint=<activeSprint>` (replace); removing the chip writes `sprint=none` so it stays off. Sort/group live in the URL (`sort`, `group`; defaults due date / status).
- **Shared sprints** (2026-10-19, not designed): space List / Board / Calendar offer the Sprint filter too (sprints covering any of the space's projects; no auto-apply). **Settings → Sprints**: Current / Upcoming / Past (newest first, 6 then "Show all N"), rows = name 600 + range muted + Current pill, project dots + names (12px), "N tasks", "…" menu (Edit sprint, Delete) for admins/owner and the sprint's creator; New sprint for everyone. Delete only while no task was ever in it (disabled with tasks; `ConfirmDialog`, it can't be undone); unticking a project whose tasks are in the sprint shows the 409 under the form.
- Theme switch before Settings exists (phase 8): clicking the sidebar user row opens an account menu (name, email, Theme Light/Dark/System segmented, Sign out). `public/theme-init.js` applies the last theme + accent before first paint.
- Sidebar space row (phase 8): the chevron toggles the tree; the name opens the space-level views (Calendar.dc.html) and expands it. At space level the space row is active and its projects show 8px project-color dots; elsewhere Main's 6px neutral/accent dots.
- Rail space badges and nav icons show a tooltip with their name; the rail search button expands the sidebar and focuses search.

### 2.5 Not designed (derive from existing language)
Login, invite accept, Settings, ⌘K palette, shortcuts help, filter/sort/group menus, all "…" menus, toasts, skeletons, errors, populated Inbox, `/t/:key` page, Share dialog, workspace switcher menu, new space/project/sprint forms, notification settings, space-level List/Board, dark mode outside List. Rules: popovers/menus = surface, 1px border, radius 10, padding 4, `--shadow-popover`, 32px options with 6px radius, accent ✓ on selected; dialogs = modal style.

**Login / invite accept (derived, phase 3)**: page `--bg-subtle`; 56px header with 24px accent "K" tile + "Kite" (14/600) left and the МН/EN segmented switcher (default track `--surface-2`) right. Centered card 400px max, top offset `min(12vh, 112px)`, `--surface`, 1px `--border`, radius 14, padding 32, `--shadow-modal`. Title 20/28 600 −0.01em, subtitle 13px muted. Fields: label 13/500 `--text-2` above a 38px input (radius 8, `--border-control`, `--control` bg, focus ring 2px accent-ink offset 1 on the field); password fields have a 28px show/hide icon button. Primary button 40px full width. Form error banner: danger soft `#FDECEC/#B42318`, radius 8, 13/500, `role="alert"`.

**Quick create, ⌘K palette, shortcuts help (derived, phase 12)**: quick create follows CreateTask.dc.html; additions not drawn: "More fields" (…) reveals Priority / Status / Tags chips (shown from the start when opened from a status or priority group); a secondary "Create and open" button sits between Cancel and Create task; the due picker's search parses typed dates (English via chrono-node, Mongolian keywords өнөөдөр / маргааш / нөгөөдөр / дараа долоо хоног / (дараа) баасан / `N хоногийн дараа` / `10-р сарын 14`) and shows the result as the first option; A/D/P work when focus isn't in a text field. Opened from a List group header "+" or the Board column "+" / "Add task to …" (pre-filled status; space level: the status category); the bottom "+ Add task" rows stay inline. **⌘K palette**: modal style (600px, 112px from top), 48px search row (16px icon, 14px input, Esc kbd), groups Actions / Tasks / Projects / People with 12px muted headings, 32px options (radius 6, selected `--popover-hover`), task rows = status marker + mono key + title + project; footer hints like the pickers. Empty query shows actions + sidebar projects. A person opens the current project/space List filtered `?assignee=`. **Shortcuts help** (`?`): modal 640px, 20/28 title + ×, two columns of groups (General, List, Quick create, Pickers), rows 32px with kbds; sequences read "G then I".

**New project / New sprint (derived)**: **New project** = a 24px "+" icon button on each sidebar space row ("New project in {space}"), shown on row hover / focus-within (and while its popover is open). It opens the same 256px popover form as New space: name only (≤ 80). The server picks the key, color and default statuses. On success the space expands and the new project opens on its List empty state (templates). **New sprint** = "New sprint" in the project "…" menu (after a separator), opening a 400px modal, a "+ New sprint" row under the drawer's sprint picker list, which swaps the list for the same form inside the popover (300px; Cancel returns to the list), and Settings → Sprints. The created sprint is picked for the task. Form: 13/600 "New sprint" / "Edit sprint" heading, optional name (placeholder "Sprint {next workspace number}"), Start / End date fields (Reports custom-period style), inline `role="alert"` when End < Start, **Projects** (checkbox list by space, 168px max with scroll, prefilled with the current project; at least one), Cancel (ghost) / Create sprint or Save (primary). Prefilled dates continue the latest sprint of that project: the first working day after it ends (not before today), with the same number of working days (else 10). Weekends are skipped but holidays aren't, because the client doesn't know them.

**Archive project / Delete space (derived)**: admins and owners only. Members don't see the menu items, and the server answers 403. **Archive project** = the last item of the project "…" menu (after a separator, archive icon). There's no confirm, because it can be undone: the app opens the space's List and shows a "{name} archived" toast with Undo. The project then leaves the sidebar, favorites, search/⌘K, My Tasks, space views and reports, and its tasks are kept. On an archived project's page (old link, Settings) a strip sits under the header: `--bg-subtle`, `border-b --border-subtle`, archive icon, 13px `--text-2` "This project is archived…", plus a "Restore project" secondary button for admins. The "…" menu shows "Restore project" instead of Archive. **Settings → Archived** tab: the archived projects, most recent first (`GET /workspaces/:id/archived-projects`). Each row has the project dot, a name link, the mono key, then "{space} · Archived {date}" in 12px muted, and a Restore button for admins. Members see an "Only admins can restore projects." note. There's also an empty state. **Delete space** = a danger item (trash icon) after a separator in the space "…" menu. It asks with `window.confirm` (it can't be undone), then shows a "{name} deleted" toast and opens My Tasks. A space that still has projects, archived ones included, answers 409 `SPACE_NOT_EMPTY`, shown as a toast. There is no move-project UI yet, so a space that only holds archived projects can't be emptied from the app.

**List view (derived, phase 9)**:
- **Status marker instead of the checkbox** (user decision, 2026-10-16; the design draws a checkbox): the first column is a 28px ghost button (radius 6, `--hover`) holding a 16px `StatusDot`, labelled "Status of {name}: {status}". It opens the drawer's `StatusPicker` (220px, current status highlighted). The change goes through `PATCH /tasks/:id` like the drawer (end of the new status; entering review sets the reviewer). Picking a Done status shows the "Completed" toast with Undo, which moves the task back to its old status and slot (`useMoveUndoToast`). On the space list the statuses of the task's project load on first hover/focus/open. `x` and the row menu "Mark complete" still complete: to the project's first Done status (user decision; the design keeps it in place); Reopen returns it to the status it had before Done. My Tasks rows use the same marker (user decision, 2026-10-19; `StatusButton` in `features/pickers/`): the task's project statuses load on first hover/focus/open, the change is the same `PATCH`, picking Done strikes the row through in place, moves the stat cards and the sidebar count and shows the Undo toast, which returns it to its old status (at the end of it: My Tasks rows carry no position).
- Selected row (j/k, click): `--bg-subtle` + `inset 2px 0 0 var(--accent-ink)`; the row is the roving tab stop (focus outline offset −2px). `j`/`k` move, `Enter` opens `?task=`, `x` toggles complete, `Space` picks a row up for keyboard drag.
- Inline add: the 36px "+ Add task" button turns into a same-height row with a 13px input (placeholder `table.addTaskPlaceholder`); Enter creates (keeps focus, clears), Esc / blur-when-empty closes. The group header "+" opens it (and expands the group). New tasks inherit the group (status / assignee / priority) and the sprint filter.
- Cell pickers: assignee/due/priority/tags cells are 28px ghost buttons (radius 6, `--hover`), aligned −6px so content lines up with the column; empty cells show a faint icon on row hover/focus. Pickers follow CreateTask's popovers (264px, `--shadow-popover-lg`, selected option `accent-soft` + ✓).
- Drag (project list, Group: Status): source row opacity .4; overlay = the row on `--surface` with `--shadow-drag`, radius 8. Dropping while sorted by due/priority/created switches the URL to `sort=manual`. Collapsed groups accept drops (end of group).
- Filter menu: field list (Status, Assignee, Priority, Tags, Sprint, Due date) with accent-soft counts → per-field picker with a back row; Assignee offers Me / Unassigned (`assignee=me` stays literal in the URL). Due: Overdue / Due today / This week / Next week + From/To date inputs. Lists are comma-separated in the URL (`?status=a,b`). Chips: "{Field} is {values}" (mn "{Field}: …"), max 240px value.
- Space list: groups = 4 status categories; each row starts with an 8px project dot + project name (12px muted); no drag, no inline add.
- Group: Assignee/Priority show only non-empty groups (a task with two assignees appears in both); Group: None = one headerless list.
- Empty project toolbar: Filter disabled (`--border-subtle` border, `--text-faint`), no Sort/Group, no filter strip. "Import from CSV" disabled with "Coming soon" tooltip; "Invite teammates" → `/settings?tab=members`; `C` = Create first task.
- Task drawer (shell until phase 10): `?task=KEY`, 40% / min 520, scrim, focus trapped, Esc / scrim click closes; header `project › KEY`, open full page, close; read-only properties.

**Task drawer (derived, phase 10)**:
- Mounted once in the app shell, so `?task=KEY` works over any page; `/t/KEY` renders the same `TaskDetailView` centered (max 760px) without the open-full-page and × buttons. Overlays form a floating-ui tree: Esc and outside clicks close only the topmost picker; toasts and @-suggestion popups (`data-overlay-keep`) never dismiss the drawer.
- Header … menu: Duplicate (same project, right after the original, title "{title} (copy)", subtasks unchecked; toast with Open), Move to project… (opens the Project property's picker; new key, status by category, sprint kept when it covers the new project, else cleared; toast), Delete (drawer closes, toast "APP-142 deleted · Undo" → restore). Mark complete reads "Mark incomplete" on done tasks.
- Extra property rows below Tags: Sprint (name; range as tooltip; "No sprint") and Project (dot + name). Start date is its own muted ghost button after the due ("· Started Oct 4", future "· Starts …", "+ Start date" on hover when empty).
- Description autosaves 800ms after typing and on blur/close; "Saving… / ✓ Saved / Couldn't save · Try again" sits right of the heading (12px muted). Esc leaves the editor; the second Esc closes the drawer. Text ▾ = Text / Heading (h3 16/24) / Subheading (h4). Link = small popover with a URL field.
- Subtasks: click the title to rename; the due date (while open) and the 22px avatar are pickers (faint calendar / dashed avatar on row hover when empty); "…" on hover → Delete. Rows drag by pointer (4px) or Space on the focused row.
- Attachments: images preview via `?inline=true` (`object-fit: cover`), falling back to the design's placeholder art; other files show a type badge (PDF danger-soft, others the neutral chip). Clicking an image card opens the image preview (derived, no design): full-viewport `--scrim-lightbox` (light rgba(24,24,27,.88), dark rgba(0,0,0,.88)), a surface bar on top (max 720px, radius 10, `--shadow-popover`: name 13/500, "248 KB · Dorj E." 12px muted, "2 / 3" when several images, Download, Close), the image contained (radius 10), 36px round surface ←/→ buttons and arrow keys that wrap; Esc or a click beside the image closes it and focus returns to the card; ⌘/middle-click opens the image in a new tab; a missing file shows "This image can't be shown" + Download. Other files download on click. Hover "…" → Open (images) / Download / Delete (uploader or admin). Uploading files show as dimmed pending cards. Dragging files over the drawer shows an accent dashed overlay.
- Activity: one feed query, tabs filter client-side. Status lines use the short "changed status to <to>" form when the change starts from the status the feed last showed. Markers: grey (`--project-dot-inactive`), In Review accent, Done / completed subtask green, Urgent red. Replies are collapsed behind "N replies" and indent 34px; deleted comments with replies stay as an italic muted tombstone; edited comments show "(edited)".
- Composer is sticky at the bottom of the scroll area (border-top `--border-subtle`); resting border `--border-control`, focused accent + ring. A sent comment appears at once (dimmed until saved) and scrolls into view.
- Toasts (not designed): bottom center, inverted like the tooltip (`--tooltip-bg/fg`), radius 10, 13px, `--shadow-popover`, action in accent-ink-dark, × to dismiss, 5s.

**Board (derived, phase 11)**:
- Shares the List's URL filters and query cache (sort is client-side). Toolbar: Sort keeps its menu but defaults to Manual on the board (`sort` absent = manual there, due date on the List); Group becomes "Columns: Status" (single option for now). Dropping a card while sorted by another field clears `sort` so the dropped order shows.
- Columns fill the remaining height; each card list scrolls on its own, the board scrolls sideways. Column "…" menu: Add task, Collapse/Expand; a collapsed column is a 44px strip (dot, count, vertical label), remembered per board (`board:p:<id>` in `collapsedGroups`). Done is open by default (unlike the List).
- Inline add: the column's "+" or "+ Add task" opens a card-styled input (44px, accent border + ring) at the bottom; Enter adds and keeps it open, Esc/blur-empty closes.
- Drag: cards never shift; the source stays as the ghost, the lifted copy follows the pointer, and the 116px placeholder shows where the card lands (hidden when the drop would be a no-op). Keyboard: Space picks up, ←/→ jump to the neighbouring column (same slot), ↑/↓ step through slots, Space/Enter drops, Esc cancels; screen-reader announcements are translated. A failed move rolls back with a "Couldn't move the task" toast.
- Space board: columns are the 4 categories, each card starts with an 8px project dot + project name (12px muted); no drag and no inline add (statuses belong to each project), column menu only collapses.
- Card assignee stacks ring in `--surface` (not `--bg`), max 3 + "+N". Card due tones: overdue 600 + "· Overdue", today 500, done muted, others `--text-3`.

**Calendar (derived, phase 14)**:
- Data: two queries with the URL filters — tasks due on the visible days (`dueFrom`/`dueTo` = grid range, intersected with a URL due filter) and open undated tasks (`hasDueDate=false&includeDone=false`, URL due filter ignored). The view renders their union, placed by each row's current `dueDate`, so the shared optimistic `useUpdateTask` moves a task between grid and panel with no calendar-specific cache code.
- The project calendar does not auto-apply the active sprint filter (a `sprint` param carried over from List/Board still applies). The filter strip shows chips only (no "N tasks · M done") and nothing when no filter is on. Toolbar: Filter + New Task (no Sort/Group).
- Month/Week and hidden projects persist in `kite.ui` (`calendarMode`, `calendarHidden[spaceId]`); the shown period resets to today on each visit. Toggled-off projects disappear from the grid **and** Unscheduled. Project chips only on the space calendar.
- Month grid has 4–6 rows (whole Mon–Sun weeks); the last column/row drop their inner borders. Weekend cells `--calendar-weekend` (#FCFCFD; dark #141416, derived). The "+N more" popover covers its cell (−4px, width cell + 96, min 240).
- Drag: pointer (4px) or keyboard (Space picks up; ←/→ a day, ↑/↓ a week in month view, → from a Sunday reaches Unscheduled and ← comes back; Space/Enter drops; Esc cancels). Lifted copy = the pill/card with `--shadow-drag`; source 50% + dashed accent. Only targets where the drop changes something light up; done tasks can't be dropped on Unscheduled. Failure rolls back with a "Couldn't reschedule the task" toast. Pills in the day popover open the task but don't drag.
- Unscheduled: "+" opens quick create (current project + sprint on a project calendar, no due date); the filter matches titles; "No results" when the filter hides everything; cards open the drawer on click/Enter.

**Admin console `/admin` (platform admin, 2026-10-20; not designed)**: no shell (the platform admin has no workspace). A 56px header like the signed-out pages (K logo, "Kite", an "Admin" chip, the email, the language switch, Sign out), then a 760px column: 24/32 page heading, "New workspace" as a `SettingsSection` (name and address side by side above 640px, the address follows the name until edited and shows the public feedback URL as its hint, owner email, primary "Create workspace"; field errors under each field in `--danger`), the created owner link in the shared `InviteLink` box, and "All workspaces" as a divided list (name; address · member count; owner, or pending invite with its expiry, or "No owner yet"; "New owner link" opens an inline email field until an owner exists).

### 2.6 PROMPTS.md vs designs (resolved; PROMPTS updated)
- Checkbox is native square 16px with `accent-color` (not round).
- List tags: all chips, clipped by the cell; "+N" only on Board.
- Drawer breadcrumb `project › KEY`; min width 520.
- Board done cards: muted title + green check icon, no strike.
- Calendar month: ≤3 tasks show all; >3 → 2 + "+N more".
- Week chart = current Mon–Sun week.

### 2.7 Usability review additions (phase 2, 2026-10-13; not in the designs, approved)
From `docs/review/USABILITY.md`; each reuses existing tokens and components.
- **List/Board done window**: List and Board load open tasks plus those completed in the last 14 days. A 12px muted note "Done in the last 14 days · **Show all**" (accent-ink 500 button) sits under the List and at the foot of the Board's Done column; `?done=all` loads every done task ("All done tasks · Recent only").
- **Hidden-by-filters hints**: with filters on, the count line reads "27 of 139 tasks · 3 done"; open Board columns end with a 12px muted "+N hidden by filters" button that clears the filters.
- **Task key in the List**: Geist Mono 12px `--text-muted`, min 64px, before the title in the name cell; on by default, "Task key" in the Columns menu.
- **Quick create**: Priority and Sprint (when the project has sprints; 14px sprint icon, "No sprint" muted) join the main chip row after Due; the sprint defaults to the view's (when it covers the project), else the project's current sprint; switching project keeps a sprint that covers the new one. Outside a project page the last project used in quick create is the default.
- **My Tasks**: a "Done this week" section (completed this week, latest first, collapsed by default, no "+ Add task") after Later; the three stat cards are buttons (hover `--bg-subtle` except the danger card) that open and scroll to Today / Done this week / Overdue; the project name in a row links to its List.
- **⌘K task rows**: after the title, status name and due date (12px muted) and the first assignee's 20px avatar; done titles struck through in `--text-muted`.
- **Tag picker**: "+ Create tag “…”" as the first option when no tag has that name (admins and owners only; members pick existing tags); color hashed from the name (`colorFor`, `lib/palette.ts`).
- **Settings → Tags** (derived, admins and owners manage; members see it read-only under an "Only admins and owners…" note): toolbar with a search box (`settingsInput`, search icon), a Name / Most used `SegmentedControl` and a primary "+ New tag" button. "New tag" opens an inline row: name field, live `TagChip` preview, the 13 palette colors as `ColorSwatches` (round 28px `pal-tag-*` chips, ✓ on the selected one; default = the name's hashed color), Create / Cancel. Rows (min 48px, `border-t --border-subtle`): a 28px color button (16px swatch; opens a popover with the 13 swatches), the `TagChip` (inline rename field + Save / Cancel when renaming; a taken name shows "A tag named … already exists" under it), "N tasks" in 12px muted tabular, and a "…" menu (Rename, Merge into…, separator, Delete in danger). **Merge into…** = modal (440px): a tag picker of the other tags with their counts, the consequence sentence once one is picked, Cancel / Merge (danger). **Delete** = `ConfirmDialog` (danger) saying how many tasks lose it. Neither can be undone, so both ask first.
- **Assignees**: the multi picker lists who was assigned when it opened under "Assigned" first; the List row menu has "Reassign…" (single picker that replaces everyone); drawer assignee chips get a 20px × button.
- **Reports periods**: "Last week" and "Last month" segments (the toolbar wraps the export button to a second row at 1440px in Mongolian).
- **Workload**: a dashed-outline legend swatch and bar segment "Not due soon" (1px dashed `--bucket-none-border`) after the counted buckets; uncounted tasks in an expanded row read "· not counted".
- **Settings → Members**: a search box (`settingsInput`) above lists longer than 8 people; "No members match".

### 2.8 Phase-3 features (2026-10-14; not in the designs, approved: "follow existing language")
From `docs/review/FIX_PLAN.md` phase 3; existing tokens and components only.
- **Drawer · Followers**: a property row (bell icon) with a 24px avatar stack and a 28px outline toggle "Follow" (accent-ink) / "Following" (`aria-pressed`). **Mentioned in**: a section above Activity, 36px rows (status dot, mono key, title, "in a comment" / "in the description") linking to the task (at the comment). **Refers to**: a 12px muted row of chip links (`--chip`, mono, accent-ink) under the description for the keys it contains; keys in the editor and comments are mono, accent-ink, dotted underline (`.task-key-link`).
- **Edited by**: 11px muted "Dorj E. just now" after a property another person changed (10 s); a title conflict line under the title: "Dorj E. changed the title to “…”. **Use theirs**".
- **Notifications**: project options menu gets a heading "Notify me about" with All activity / Mentions and assignments / Nothing; Settings → Notifications adds a "Per project" list (project dot, name, space, level menu button); Inbox actions get a 32px outline "All projects ▾" filter (`?project=`).
- **List multi-select**: a 28px select column before the status marker (visible on hover/focus or while anything is selected; header box selects all visible). The bulk bar floats 80px above the bottom, centred, surface + `--border` + `shadow-popover`, radius 12: "N selected", 32px toolbar buttons Status / Sprint / Assignees (menu: add / replace / remove) / Due / Priority / Delete (danger text) and ×.
- **Reports · People / My performance**: "Completed in this period" / "What you completed" list built like the open-tasks list (completed date, cycle time, priority), 5 rows then "Show all N"; the Completed card is a button that opens it.
- **List filters**: "Created by" field (Me + members). **My Tasks**: "Requested by me" section (collapsed, no add row; rows show up to two assignee avatars before the space badge).
- **Project brief**: a 40px strip under the header (chevron, "Project brief", first line of the brief in muted text, lead picker on the right); expanded, the description editor (max 760px) with Saving/Saved like a task.
- **Members**: row "⋯" menu (Set out of office… / Deactivate…), "Away until Oct 20" chip (`--chip`, 11/500) after the name; the deactivate dialog (480px: counts, "Hand their open work to" picker, Cancel / danger "Deactivate"); a "Deactivated (N)" list with Reactivate. Profile gets an "Out of office" row: since 2026-10-16 a list of dated periods (`user_absences`: from, until, note; add / edit / delete with Undo), the same list in the admins' "Set out of office…" dialog. Pickers' hint and @-suggestions read "Away until …"; drawer assignee chips add a muted "away"; Workload's pill becomes a dashed-outline "Away until …".
- **⌘K**: a Comments group (author avatar, snippet with the match in 600, key) and a "Show more tasks" row (accent-ink).
- **Danger buttons in dark mode** use `--on-danger` (dark ink) on `--danger` (#f87171): white was 2.8:1.

## 3. Reusable components

Primitives in `apps/web/src/components/ui`, composites in feature folders. `PaletteKey`, `StatusCategory`, `Priority`, `UserLite`, `TagLite` come from `packages/shared`.

### Identity & metadata
| Component | Props | Used in |
|---|---|---|
| `Avatar` | `user: UserLite`, `size?: 20\|22\|24\|26\|28`, `ring?: boolean` (2px bg border for stacks), `title?`, `online?` (presence dot) | everywhere |
| `AvatarStack` | `users`, `max?`, `size?: 24\|26`, `label` (aria, "7 project members"), `onlineIds?`, `onlineLabel?` — renders "+N" chip | top bar, Board cards, List cell, drawer viewers |
| `SpaceBadge` | `initial`, `color: PaletteKey`, `size?: 16\|18\|22` (square, radius 4/5/6) | sidebar, breadcrumb, My Tasks rows |
| `WorkspaceTile` | `name`, `size?: 24\|28` (accent bg, white initial) | sidebar, rail |
| `ProjectDot` | `color: PaletteKey \| 'accent' \| 'inactive'`, `size?: 6\|8` | sidebar, chips, pills, pickers |
| `StatusDot` | `category`, `size?: 8\|12` | list groups, board, status picker, pills |
| `StatusPill` | `name`, `category` | activity history |
| `PriorityFlag` | `priority`, `size?: 12\|14`, `showLabel?` | list, board, my tasks, drawer, unscheduled |
| `TagChip` | `name`, `color: PaletteKey` | list, board, drawer |
| `TagList` | `tags`, `max?` ("+N"), `wrap?` | list (clip), board (max 2) |
| `DueDate` | `date`, `done?`, `variant: 'cell'\|'card'\|'property'\|'weekday'`, `startDate?` | list, board, my tasks, drawer, subtasks |
| `TaskKey` | `value` (Geist Mono 12) | drawer header, palette, inbox |
| `SubtaskProgress` | `done`, `total`, `bar?: boolean`, `barWidth?: 32\|160` | list, board, drawer |
| `CommentCount` | `count` | list |
| `ProgressBar` | `value`, `total`, `width` (4px; accent → success at 100%) | board, drawer |

### Controls
| Component | Props | Used in |
|---|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'ghost'`, `size?: 'sm'(28/30)\|'md'(32)\|'lg'(40)`, `icon?`, `kbd?`, `href?`, `disabled?` | everywhere |
| `IconButton` | `icon`, `label` (aria), `size?: 20\|24\|28\|32\|36`, `variant?: 'ghost'\|'dashed'` | everywhere |
| `ToolbarButton` | `icon`, `label`, `count?`, `disabled?` (32px outline) | Filter/Sort/Group/All spaces |
| `Kbd` | `children`, `variant?: 'plain'\|'raised'\|'onAccent'`, `size?: 'xs'\|'sm'` | sidebar, modal, empty states |
| `SegmentedControl<T>` | `options: {value,label,lang?,title?}[]`, `value`, `onChange`, `role?: 'radiogroup'\|'tablist'`, `label`, `size?: 'sm'(24/26)\|'md'(28)`, `track?: 'sidebar'\|'default'` | language, activity tabs, Month/Week |
| `UnderlineTabs` | `items: {value,label,icon?,href}[]`, `value`, `label` | view switcher, inbox tabs |
| `Checkbox` | `checked`, `onChange`, `label` (aria) | rows, subtasks |
| `Switch` | `checked`, `onChange`, `label` | Create more, settings |
| `CountBadge` | `value`, `tone?: 'neutral'\|'accent'\|'accentSoft'\|'danger'\|'onPanel'` | nav, groups, columns, filter |
| `FilterChip` | `label`, `value`, `onRemove` | filter strip |
| `ToggleChip` | `label`, `color`, `pressed`, `onToggle` | calendar project filter |
| `SearchInput` | `label`, `placeholder`, `value`, `onChange`, `kbdHint?` | sidebar, unscheduled, pickers |
| `GroupHeader` | `label`, `count`, `open`, `onToggle`, `marker?`, `tone?: 'default'\|'danger'`, `hint?`, `onAdd?`, `addLabel?` | list groups, My Tasks sections |
| `AddRowButton` | `label`, `onClick`, `indent?` | list, board, my tasks |

### Overlays
| Component | Props | Used in |
|---|---|---|
| `Popover` | `trigger`, `open`, `onOpenChange`, `placement?`, `width?`, `elevation?: 'sm'\|'lg'` | all pickers/menus |
| `Picker<T>` | `items`, `value: T\|T[]\|null`, `multiple?`, `onChange`, `getKey`, `renderItem`, `search?: {placeholder, filter}`, `groupBy?`, `footerHints?`, `allowClear?`, `emptyText` — ↑↓ ↵ ⌫ Esc | Assignee/Due/Project/Status/Priority/Tag pickers |
| `Menu` | `trigger`, `items: {label, icon?, kbd?, danger?, onSelect}[]` | row/column/project/comment/task "…" |
| `Modal` | `open`, `onClose`, `labelledBy`, `width?` (600), `top?` (112) | quick create, dialogs |
| `Drawer` | `open`, `onClose`, `labelledBy`, `width?` ('40%'), `minWidth?` (520) | task detail |
| `Tooltip`, `Toast` (`useToast`) | — | global |
| `EmptyState` | `illustration`, `title`, `body`, `actions`, `footer?` | empty project, inbox, unscheduled |

### Rich text
| Component | Props | Used in |
|---|---|---|
| `RichTextEditor` | `value: JSONContent`, `onChange`, `variant: 'description'\|'comment'\|'plain'`, `toolbar?`, `mentions` (member source), `placeholder`, `autoFocus?`, `onSubmit?` (⌘↵) | drawer description, composer, quick create |
| `MentionChip` | `user` | editor, comments |

### Layout & domain composites
| Component | Props | Used in |
|---|---|---|
| `AppShell` | `children` | all |
| `Sidebar` / `SidebarRail` | `collapsed`, `onToggle` (data via hooks) | all |
| `NavItem` | `icon`, `label`, `href`, `count?`, `badge?`, `active?` | sidebar |
| `SpaceTreeItem` | `space`, `open`, `onToggle`, `projects`, `activeId`, `active?` | sidebar |
| `ProjectNavItem` | `project`, `active`, `isNew?` | sidebar |
| `LanguageSwitcher` | `variant: 'segmented'\|'cycle'` | sidebar, rail |
| `SidebarUser` | `user`, `online` | sidebar |
| `PageHeader` | `title \| breadcrumb`, `actions`, `tabs?`, `toolbar?` | all pages |
| `Breadcrumb` | `items: {label, href?, badge?}[]` | top bar, drawer |
| `TaskRow` | `task`, `density`, `onToggleDone`, `onOpen`, `showProject?` | list |
| `MyTaskRow` | `task`, `tone` | my tasks |
| `TaskCard` | `task`, `state?: 'idle'\|'ghost'\|'overlay'` | board |
| `DropPlaceholder` | `label`, `height?` | board |
| `CalendarPill` | `task`, `variant: 'month'\|'popover'\|'week'` | calendar |
| `DayCell` / `DayPopover` | `date`, `tasks`, `inMonth`, `isToday`, `dropTarget?` | calendar |
| `UnscheduledCard` | `task`, `dragging?` | calendar |
| `PropertyRow` | `icon`, `label`, `children` | drawer |
| `SubtaskRow` | `subtask`, `onToggle`, `onChange` | drawer |
| `AttachmentCard` / `UploadDropzone` | `attachment`, `variant: 'image'\|'file'` / `onFiles` | drawer |
| `HistoryItem` | `actor`, `parts: (text\|bold\|status)[]`, `time`, `marker` | drawer activity |
| `CommentItem` | `comment`, `replies?`, `own`, `onReply` | drawer activity |
| `CommentComposer` | `taskId`, `onSubmit` | drawer |
| `FeedItem` | `actor`, `verb`, `task`, `tail?`, `quote?`, `time`, `project`, `unread` | my tasks, inbox |
| `StatCard` | `icon`, `label`, `value`, `sub`, `tone?: 'default'\|'danger'`, `aside?` | my tasks |
| `WeekBars` | `values: number[7]`, `todayIndex` | my tasks |
| `FieldChip` | `leading`, `label`, `kbd`, `active`, `onClick` | quick create |
| `TemplateCard` | `icon`, `color`, `name`, `description`, `onClick` | empty project |

### Reports (`features/reports/`; charts are hand-drawn SVG like `WeekBars`, no chart library)
Reused: `PageHeader`, `NavItem`/`RailLink`, `UnderlineTabs`, `SegmentedControl`, `Popover` + `Picker`, `Avatar` (add sizes 36, 44), `ProjectDot`, `StatusDot` (add size 10), `PriorityFlag`, `CountBadge`, `Tooltip`, `EmptyState`, `Skeleton` (add shimmer), `useDates`, `useRelativeTime`, quick create, task drawer. `StatCard` moves from `features/my-tasks` to `components/ui`.

| Component | Props | Used in |
|---|---|---|
| `StatCard` (`components/ui`) | `icon`, `label`, `value`, `unit?` (13px), `sub?` (12px), `aside?`, `footer?`, `tone?: 'default'\|'danger'`, `valueSize?: 28\|26` | My Tasks, all Reports tabs |
| `ReportsLayout` | — (header, tabs, toolbar slot, `<Outlet/>`, "Updated" / loading status) | /reports/* |
| `PeriodControl` | `value: {period, from?, to?}`, `onChange`, `disabled?` (Custom opens a from/to popover) | Overview, People, Mine |
| `ScopeFilters` | `spaceId`, `projectId`, `onChange` | Overview, Sprints, Workload |
| `ExportButton` | `href`, `label`, `disabled?` | all tabs |
| `DeltaChip` | `value: string`, `direction: 'up'\|'down'\|'flat'`, `tone: 'good'\|'bad'\|'neutral'` | stat cards |
| `InsightBox` | `tone: 'accent'\|'warning'\|'neutral'`, `icon`, `children` | waits, burndown, People/Mine notes |
| `WarnChip` | `label` (Stale / Replan) | aging, carried |
| `ChartTooltip` | `x` (%), `align`, `children` | all charts |
| `ChartFrame` | `ticks`, `xLabels`, `ariaLabel`, `table?` (sr-only data table), `gutter`, `endMargin` (gridlines, y gutter, x labels) | every chart |
| `LineTrend` | `points: {label, title, value, prev?, partial?}[]`, `seriesLabel`, `prevLabel?`, `partialNote?`, `table?` | Overview throughput |
| `BarByCategory` | `items: {key, label, marker, value, valueLabel, color}[]`, `max?` | Overview waits |
| `StackedBar` | `segments: {key, value, fill \| 'hatch', title}[]`, `scale`, `marker?` | Workload |
| `Burndown` | `points: {label, title, remaining, ideal, projected, added}[]`, `todayIndex` | Sprints |
| `ReportTaskTable` | `columns`, `rows`, `template` (grid), `label` | aging, carried |
| `SprintPicker` | `sprints`, `value`, `onChange` | Sprints |
| `SprintBanner` | `sprint`, `workingDays`, `dayIndex`, `daysLeft` | Sprints |
| `SprintBarsChart` | `history`, `selectedId` | Sprints |
| `BurndownChart` | `days`, `todayIndex`, `projectedEnd` | Sprints |
| `CarryPips` | `count`, `flagged` | carried table |
| `WorkloadTable` / `WorkloadRow` | `people`, `capacity`, `sort`, `open`, `onToggle`, `onAssign` | Workload |
| `StackedLoadBar` | `buckets`, `scale`, `capacity` | Workload |
| `CapacityPill` | `load: 'heavy'\|'balanced'\|'light'`, `title` | Workload |
| `BucketLegend` | — | Workload |
| `PersonPickerRow` / `MineHeader` | `person`, `compared` / `person`, `period`, `range` | People / Mine |
| `TrendCards` → `ReferenceTrend` | `trends`, `variant` → `points`, `reference`, `max`, `formatValue`, `formatTooltip`, `table` | People, Mine |
| `HelpingPanel` | `helping`, `variant`, `period`, `range` | People, Mine |
| `OpenTasksList` | `tasks`, `variant` | People, Mine |
| `ReportsEmpty` | `completed`, `required`, `project` | any tab with < 5 completions |
| `SegmentProgress` | `value`, `max`, `label` | ReportsEmpty |
| `ReportsSkeleton` | `variant: 'overview'\|…` | loading |
| `SizeProperty` | `taskId`, `size`, `onChange` | task drawer |

## 4. Phase 15 polish — what doesn't match exactly

Checked every screen in mn/en × light/dark at 1440px, plus 1024px and 820px content widths with an overflow probe (no element spills its box; long Mongolian labels truncate with a title or wrap). Remaining differences:

- **Populated Inbox, Settings, toasts**: not designed. Inbox rows reuse the My Tasks feed row (task named by key + title); Settings uses the derived-UI rules (rows of label + hint / control, `SegmentedControl`, `Switch`, popover pickers).
- **Inbox quote on hover**: the snippet's `--bg-sidebar` box and the row hover (`--bg-subtle`) are 1–2 steps apart, so the box nearly disappears on hover (same as the My Tasks feed in the design).
- **Inbox tip**: the design lays "press G then I" out with `flex; gap: 6px`, which puts a gap before the Mongolian comma ("G ,"); rendered as inline text instead.
- **Dark mode outside List**: only ListDark is drawn; other screens use the dark tokens as-is.
- **Board toolbar under ~900px**: "+ New task" wraps to a second toolbar line (no overflow).
- **My Tasks stat card (mn)**: "Өмнөх долоо хоногоос +9" wraps to two lines next to the week bars at ≤1100px.
- **Time zone picker**: opens at the top of the list (search to find a zone) rather than scrolled to the current one.
- **Sidebar badge sync**: updates instantly for my own inbox actions; new notifications arrive over realtime. Reading/archiving in another tab of mine syncs on refetch only (no event for it).
- **Realtime visuals (not designed, phase 16)**:
  - *Online dot on avatars*: 8px (6px under 24px avatars) `--online`, bottom-right at −2px, 2px ring in the avatar's ring color (`--bg`, or `--surface` on cards/drawer), drawn above the next avatar of a stack. Shown in the project header stack, the drawer viewers and Settings → Members. The sidebar row keeps its designed dot, which turns `--text-faint` while disconnected.
  - *"Reconnecting…" pill*: shown after 2s disconnected, top center of the page area. 28px, radius full, `--surface` bg, 1px `--border`, `--shadow-popover`, 12px `--text-muted`, 12px spinning loader (static under reduced motion). en "Reconnecting…" / mn "Дахин холбогдож байна…".
  - *Drawer viewers*: other people with the same task open, a 24px stack (max 3, surface ring, online dots) between the breadcrumb and Mark complete; hover/aria "Also viewing: Sara K." / "Мөн харж байна: Sara K.". Hidden when nobody else is there.
- **Undo**: task delete, task complete (List, drawer, My Tasks) and archive notification. "Mark all as read" has no undo (no mark-unread endpoint).
- **Mongolian copy** for Inbox additions, Settings and error toasts is drafted (see `docs/i18n-review.md`).

## 5. Standups (proposed 2026-10-16; phase 1 built 2026-10-16)

Async daily standups per **standup group** (a team of workspace members with its own schedule), with an optional screen-shared meeting mode. Design files: `Standup`, `StandupWrite`, `StandupWriteMobile`, `StandupLive`, `StandupEmpty`, `StandupSettings` (plus the standup card in `MyTasks` and the "Blocked" marker in `Main` / `Board`). Design "today" is **Fri Oct 9 2026** (the seed's today is Thu Oct 8, as in Reports). Every file has `STR.mn`, so the Mongolian copy comes from the designs. No dark variant is drawn: derive it from the tokens. Status: the screen notes below are what the designs show. The data model, API and the "yesterday" rule in §5.8–5.10 are **proposals waiting for answers** (§5.11).

**Rule: standup content is never used in Reports or in any performance metric.** That covers posts, items, blockers, replies, reactions, posting times, the late marker and meeting notes. No report, export, Workload or People view reads the standup tables, and nothing counts a person's posts, late posts or blockers over time. The "who has posted" strip and the late marker only show one day.

### 5.1 Shell additions
- **Sidebar**: a new nav item **Standup** (chat-bubble icon `M21 15a2 2 0 0 1-2 2H7l-4 4V5…` + two lines) between My Tasks and Inbox. Active: accent-soft bg, accent text, 600. While I haven't posted today in a group that meets today, it shows an 8px accent dot (aria "You haven't posted today"). Add it to the rail too.
- A sidebar section **Standup groups** (12/500 muted heading, 28px) above Spaces: 30px rows, 13px, a 6px dot (accent when active, #C4C4CC otherwise). The active group gets `#EDEDF0` + `--text` 500 (the neutral selected style, not accent-soft, because the Standup nav item above already carries the accent).
- **My Tasks** (right column, above Recent activity; the column becomes a flex stack with gap 16): a **standup card**. Padding 16, radius 12, 1px border. A 36px accent-soft icon tile (radius 10) with the chat icon, h2 14/600 "Post your standup update", 12/18 muted "Mobile team · due by 10:00 · 4 of 5 have posted". Then an avatar row: 24px avatars of the people who posted (2px white ring, −6px overlap) + a dashed 24px "AB" for me + "You" in 12px muted, with aria-label "Posted: Sara, Bat, Temuulen, Dorj. Not yet: you.". Buttons: **Write update** (primary 32px → write modal) and **See team updates** (ghost → group page). States that aren't drawn: hidden on days without a standup and for people in no group; after posting it reads "You posted at 09:30 · 5 of 5 have posted" with only "See team updates"; with several groups, one card per group that's still waiting for me.
- **List "Blocked" pill** (`Main`): in the name cell after the title, before subtasks. 20px tall, padding 0 7, radius 10, danger-soft (#FDECEC / #B42318), 12/600, 12px ban icon (circle + diagonal) + "Blocked" / "Гацсан". It links to the standup page, and its title is "Waiting on final tab icons — from Temuulen's standup". Hidden on done tasks.
- **Board "Blocked" row** (`Board`): a row under the title: flex, gap 6, padding 6 8, radius 6, danger-soft, 12/16 500, ban icon, "**Blocked** · waiting on final tab icons" (600 on "Blocked"), title "From Temuulen's standup, Oct 9". The card border becomes #F3C9C4.
- Both markers show only while the group has **Mark linked tasks as "Blocked"** on and the blocker is open (see §5.11 Q3 for who sees the text).

### 5.2 Group page — `Standup.dc.html`
- **Header** (min 64px, padding 12 24): a group switcher (36px outline button: accent users icon, name 14/600, chevron; `aria-haspopup=listbox`). Day navigation: 32px ghost ‹, the date at 14/500 with min-width 168 ("Friday, Oct 9" / "Баасан, 10-р сарын 9"), and › (disabled at today, 40% opacity). A "Today" pill (22px, #F1F1F3, 12/500) shows when viewing today. Right side: a 36px icon link to **Group settings** (sliders icon), **Write update** (outline 36px, pen icon) and **Start standup** (primary, play icon → live mode).
- Content: max-width 1120, padding 20 24 48, gap 24.
- **Who has posted** strip (1px border, radius 12, padding 14 16, wrap). Left (min 160): "4 of 5 have posted" 14/600 + "Due by 10:00 · meeting at 10:15" 12px muted. The count leaves out people who are out of office. One 64px column per member:
  - 36px avatar. Posted = their palette avatar plus a 14px green check badge (#16A34A, 2px white ring) at the bottom right.
  - Not posted = white avatar with a 1.5px dashed #A1A1AA border.
  - Out of office = #E4E4E7 / #A1A1AA at 70% opacity.
  - Under the avatar: the first name ("You" for me), 12/14, then a state line at 11/14. Posted shows the time, e.g. "09:05", muted. Not posted shows "Not yet" in accent 600. Out of office shows an "Out" chip (#F1F1F3, #71717A 600, radius 8).
  - Tooltip: "Sara K. · Posted 09:05".
  - Then a spacer and **Your turn** (accent-soft, accent 600, 32px). It shows only while I haven't posted, and opens the write modal.
- **Late marker** (not drawn): a post after the "post by" time keeps its time but adds "· late" in `--warning` (strip: "10:08 · late"; card meta: "posted 10:08 · late"; tooltip "Posted 10:08, after 10:00"). It doesn't change the order or the count. In `StandupLive`, Anu posted at 10:08, after the 10:00 deadline, which is the case this covers.
- **Blockers** section (only when "Show blockers first" is on): a 16px red ban icon, h2 15/600 "Blockers" and a 20px danger-soft count of open blockers. The list sits in a box (1px #F3D3CF, radius 12). Each row has padding 14 16, a #F8E3E0 divider, #FFF8F7 bg (#FAFAFB once resolved), and:
  - an 18px native checkbox (accent-color #16A34A) labelled "Mark resolved: {text}";
  - the text at 14/20 500 (resolved: muted, struck through; use `--text-muted`, not the drawn #A1A1AA);
  - a 12px meta row: 20px avatar + "Temuulen G. · 09:20", a 24px task chip (outline, radius 6, 8px project dot, title, max 320, opens the drawer), and "Can help:" followed by an accent-soft pill (22px, 18px avatar, "@Sara K.");
  - a green "Resolved" chip (#E8F5EC / #166534) at the right once resolved.
- **Today's updates** (h2 15/600): a grid `repeat(auto-fill, minmax(440px, 1fr))`, gap 16, align start.
  - **Me, not posted**: a dashed card (1.5px #D4D4D8, #FAFAFB, padding 16). 36px avatar, "You haven't posted yet" 600, "Suggestions from your activity yesterday are ready" 12px muted, and Write update (primary 32px).
  - **Posts** (`article`, 1px border, radius 12):
    - header (padding 14 16 10): 36px avatar, name 600, "Mobile engineer · posted 09:20" 12px muted, 28px "…" ("More actions");
    - body (padding 0 16 14, gap 12): three sections, each a 12/600 label with a 6px dot. **Yesterday** has a #A1A1AA dot and a #52525B label, **Today** is accent, and **Blockers** has a #DC2626 dot and a #B42318 label. Items are 14/20 with a 12px indent, then an optional 22px task chip (7px project dot, 12px, max 260). An empty Blockers section reads "No blockers" in muted;
    - footer (#FCFCFD, top border #F1F1F3, padding 10 16 14, gap 10): reaction pills, replies and the reply field. Reaction pills are 26px, radius 13, 12/600, with a 13px icon and a count: thumbs up, eyes ("Looking"), heart ("Love"). Mine are on (`aria-pressed`, accent border + accent-soft + accent) and off is outline #52525B; aria "Thumbs up, 3". After them sits a 26px dashed circle "Add reaction" (smiley). Each reply is a 22px avatar, the name in bold + time in 12px muted, then the text at 13/18 #3F3F46. Last is the reply field (32px, radius 8, placeholder "Reply to Temuulen…").
  - **Out of office** card (1px #EFEFF2, #FAFAFB, padding 16): grey 36px avatar, the name in #52525B 600, "Out of office · back Oct 12" 12px muted, and an "Out" chip. "Back" is the first standup day after `away_until`.
  - Order: my placeholder first, then posts with blockers, then the rest by post time, then out-of-office people. The design shows Tem 09:20, Dorj 09:41, Sara 09:05, Bat 09:12, Mia.
- "…" menu (not drawn): for my own post, Edit / Delete / Copy link; for other people's posts, Copy link.

**Built (2026-10-16, phase 3)** — decisions taken while building the group page, write modal, My Tasks card and markers:
- Route `/standup/:groupId/:date?` (not `?date=`); ‹ › go to `prevDate` / `nextDate` (the bare route for today). On a weekend or holiday the page opens the latest standup day with "No standup today · next standup Mon, Oct 12" (`upcomingDate`).
- "Due by 10:00 · meeting at 10:15" sits in the strip's left column as drawn. Standup times are 24h `HH:mm` in both languages (`formatClock`), in the viewer's zone.
- Past days are read-only except replies: no Write / placeholder / Your turn, reaction pills show counts and who reacted but don't toggle, no Add reaction, the resolve checkbox is disabled; "Not yet" reads "No update". (The API still allows reactions and resolving there.)
- Out of office avatar: #E4E4E7 with `--text-3` initials and no 70% opacity (the drawn #A1A1AA / opacity fail contrast); the strip's "Out" chip uses `--text-3`.
- Blockers section rows add a "N replies" toggle with the blocker's thread and its own reply field (`blockerId`); entry cards keep all of the update's replies. Reaction pill tooltips name who reacted; "Add reaction" opens the three drawn reactions. Replies: own ones get Edit / Delete (Delete asks, like comments); the reply field has an @-popup of group members.
- "…" menu: Copy link (`#entry-…`) for everyone, plus Edit update on my own post while editable (no Delete: the API has no entry delete).
- "Start standup" is drawn but `aria-disabled` with a tooltip until live mode ships; non-members see the header and "Only members of this group can read its updates."
- Write modal: opens over the page with `?write=1`; Yesterday pre-filled from suggestions (or my saved draft/post), Today chips start unselected (Q11 still open), several blockers ("Add another blocker"), Link a task = my suggested tasks, then ⌘K search; Who can help = the people picker over group members (me excluded). Esc / × / scrim save a draft when something changed (a posted update closes without saving). The shadow reuses `--shadow-modal`.
- My Tasks: one card for every group still waiting for me (not one card per group); several groups list one block each (name, due/count line, avatar row, buttons).
- Blocked markers: the Board row is plain text with a `title` (the card is the link; a nested link fails axe); List pill and drawer line link to the standup day. Mongolian tooltip avoids inflecting names: "{text} — Тэмүүлэн стэндапдаа бичсэн · 10-р сарын 9"; outside the group "Гацсан · «Мобайл баг» бүлгийн стэндапаас, …". New tokens: `--danger-card-divider` #F8E3E0, `--blocked-card-border` #F3C9C4, `--card-footer` #FCFCFD, `--out-avatar` #E4E4E7 (dark derived).

### 5.3 Write update — `StandupWrite.dc.html` (desktop modal)
- Over the group page. Scrim rgba(24,24,27,.32) (click closes). `role=dialog` form, 640px, 56px from the top, radius 14, 1px border, shadow `0 24px 64px rgba(24,24,27,.20)` (stronger than `--shadow-modal`; add a token or reuse the modal one, TBD in build).
- **Header** (padding 16 16 12 20, bottom border #F1F1F3): a 32px avatar, h2 16/600 "Your standup", 12px muted "Mobile team · Fri, Oct 9 · due by 10:00", and an Esc kbd + × ("Close (Esc)"). The design also puts an МН/EN switch here; that's a preview control, so leave it out.
- Body: padding 16 20 20, gap 20, three `fieldset`s whose legends are 13/600 with a 6px dot and a muted hint:
  1. **Yesterday · suggested from your activity**: a list in a box (1px #EFEFF2, radius 10). Rows are min 40px with a #F4F4F5 divider. Each has a 22px kind tile (radius 6), the kind in 12px muted, the task title as a link (500, ellipsis) and a 28px × ("Remove: {title}"). The three kinds:
     - **Completed**: green check on #E8F5EC / #166534;
     - **Moved to review**: arrow on accent-soft / accent;
     - **Commented on**: bubble on #F1F1F3 / #52525B.
     After the rows comes a 40px "+ Add something else…" input. When anything has been removed, a 12/500 accent text button "Restore 2 removed" sits under the box and brings them all back.
  2. **Today · tap to add**: wrapping chips (30px, radius 15, 13/500, max 300) for my open tasks. Each chip has a 12px icon (+ when off, ✓ when on), the title and a tag at 11/500: **In progress** (muted), **Due today** (#B45309) or **Overdue** (#B42318). On = accent border, accent-soft background, `--text`, `aria-pressed`. Below is a 40px input "Anything else today?".
  3. **Blockers · optional**: a box (1px border, radius 10, padding 8 8 8 12) holding a 28px input "What's slowing you down?" and a row of attachment chips plus two 28px ghost buttons:
     - **Link a task** (link icon) adds a 26px outline chip: project dot, task title, 20px × "Remove link";
     - **Who can help** (@) adds an accent-soft pill: 20px avatar + "@Bat O.", × "Remove mention".
     In the build both open pickers: the task picker (search, my tasks first) and the member picker (group members first, away hints).
- **Footer** (#FAFAFB, top border #EFEFF2, radius 0 0 14 14): a users icon + "Visible to the 6 people in Mobile team" (12px muted; counts the group's active members, me included), a spacer, **Save draft** (ghost 32px) and **Post update** (primary 32px + "⌘ ↵" kbd on white 20%).
- Not drawn: each section takes several free-text items (Enter adds a row, ⌫ on an empty row removes it). Yesterday rows that I add by hand can link a task. Several blockers are allowed, each with its own link and helper. Editing a posted update opens the same modal with "Save changes". Esc closes and saves the draft.
- Built (2026-10-16): a draft autosaves 2 s after a change (never just for opening; never for a posted update, whose "Save changes" stays explicit). A 12px muted status ("Saving…" / "Draft saved 09:41" / "Couldn't save the draft") sits left of Save draft. Reopening a draft offers the suggestions removed earlier under "Restore N removed". The "Visible to N people" line stays in the footer as drawn.

### 5.4 Write update · mobile — `StandupWriteMobile.dc.html` (390×844)
Full screen, base 15/22. Top bar 56px: a 44px × button, a centered "Your standup" 16/600 + "Mobile team · Fri, Oct 9" 12px muted (mn "Баасан, 10/9"), and a 44px language cycle (preview control, omit). The body scrolls (padding 16 16 24, gap 22) with the same three sections:
- suggestion rows min 52px, the kind on line 1 (12/16 muted) and the title on line 2 (14/20 500), a 44px ×;
- Today chips min 40px, radius 20, 14/500, text wraps, **no tag label**, gap 8; input "Anything else?" min 48px, radius 12;
- Blockers input min 44px, then **Link a task** / **Who can help** as two equal 44px outline buttons (radius 10) that show the chosen value when set ("PRD: saved carts", "@Bat O.") in accent-soft.
- Sticky footer: **Post update** 48px, radius 12, 16/600, then the visible-to line centered. There's no Save draft on mobile, so drafts autosave.
Use this layout under ~640px width.
- Built (2026-10-16) under 640px, same URL (`?write=1`, also the reminder notification's link). Deviations: inputs are 16px (design 15px) so iOS Safari doesn't zoom on focus; the panel follows `visualViewport`, so the sticky footer sits above the keyboard; the footer line reads "Draft saved 09:41 · Visible to…" once a draft has saved; Link a task / Who can help show the choice ("@Bat O. +1" for several) and are cleared from their pickers ("Remove link" row; untick the person). Today chips keep their tag for screen readers only.
- Phone shell (not drawn): a 56px bar (menu button + workspace name) replaces the sidebar, which opens as a sheet from the left. The standup group page uses 16px gutters, a wrapping header, no "Start standup", and always shows Blockers first. The rest of the app stays desktop-first.

### 5.5 Live meeting — `StandupLive.dc.html`
- Full screen without the app shell. Page #FAFAFB, base 16/24.
- **Top bar** (64px, white, bottom border):
  - left (min 240): a 10px #DC2626 dot with a 4px #FDECEC ring ("live"), "Mobile team · Standup" 15/600 and "Friday, Oct 9 · 10:15" 12px muted;
  - center: the **speaking order** `nav` with one dot per speaker plus their first name (11/14). The current speaker is 16px accent with a 4px accent-soft ring, 600 name, `aria-current=step`, aria "… — speaking now". Done speakers are 12px solid accent ("— done"). Upcoming speakers are 12px with a 2px #C4C4CC ring. Clicking a dot jumps to that person. Out-of-office people come last: 12px hatched, name struck through in faint (use muted), not clickable, aria "Mia L. — out of office";
  - right: "Total time" 12px muted over **"06:12 / 15:00"** (15/600 tabular; the target is 400 muted), and **End meeting** (outline 36px). The language segmented control is a preview control again.
- **Speaker panel** (white, radius 16, padding 28 32, gap 20):
  - a 72px avatar, h1 34/40 600 −0.01em name (`aria-live=polite`) and "Mobile engineer · posted 09:20" 15px #52525B;
  - on the right, the person's timer "01:24" at 40/44 tabular. It turns #B45309 past the limit. Under it a 200×6 bar (accent; #D97706 once over) and "2 minutes per person" 13px muted;
  - three boxes (grid auto-fit min 240, gap 20, padding 18, radius 12). **Yesterday** is #FAFAFB / #F1F1F3. **Today** is accent at 5% with an accent 15% border. **Blockers** is #FFF8F7 / #F3D3CF. Each has an h2 15/600 with an 8px dot. Items are 20/28 with a 26px task chip and, on Today and Blockers items only, a **Create task** button (28px, 1px dashed accent, accent 13/600, "+"). Once a task exists it reads **Created** with a ✓, a solid border and accent-soft (`aria-pressed`). An empty Blockers box reads "No blockers";
  - footer (top border): **Previous** (48px outline, radius 10, 15/500; muted + `aria-disabled` on the first speaker), "Up next: Dorj E." with ← → kbds (14px muted, "Last person" on the last), and **Next** (48px accent 15/600; reads **Finish** on the last).
- **Notes** aside (340–400px, white, radius 16, padding 20):
  - "Meeting notes" h2 with a 7-row textarea (14/21, radius 10, resizable);
  - "Tasks created" with a count badge, then cards (1px #EFEFF2, radius 10, padding 10 12) that open the task drawer: an accent plus-square icon, the title 500, "From Temuulen's blocker · App Redesign" 12px muted (or "…'s plan"), and the assignee's 22px avatar. Empty: a dashed box "Use “Create task” on a blocker or item to add it here.";
  - **Save notes to standup** (40px outline, at the bottom).
- Keyboard: ←/→ previous/next. The timer counts only while the person is current and keeps its time if you come back. The order follows the group setting (posting order in the design: Sara 09:05, Bat 09:12, Tem 09:20, Dorj 09:41, Anu 10:08). People who didn't post come after those who did; out-of-office people come last and are skipped.
- **Built (2026-10-16), and what the design doesn't draw:**
  - Inside the shell with the sidebar hidden (route `handle: { chrome: 'none' }`), so the task drawer and quick create work. The МН/EN switch is dropped (Q14).
  - Dark mode uses the tokens: boxes `bg-subtle` / accent 5% / `--danger-card-*`; timer over → `--warning`, bar over → `--status-progress`; the live dot is `--prio-urgent` ringed with `--danger-soft`, grey when not running.
  - **Follower view**: same page, read-only. An accent-soft strip under the top bar reads "{name} runs the meeting. This page moves with them." There are no Previous/Next or Create buttons; the footer shows "Up next". The order dots aren't clickable, and the notes are plain text that updates live.
  - **Before the start**: a panel "The meeting hasn't started yet" with Start standup (driver), or a note about who starts it, or why it can't start (no meeting time, not today, everyone out). **After the end**: "Meeting ended · Took N min · K tasks created", the tasks, Back to standup. Notes can still be edited and saved.
  - "Created ✓" is a link to the task, showing its key, not a toggle. The design's `aria-pressed` toggle would suggest it can be undone.
  - The footer is sticky so Next stays in view on a long update. When an item's text is its task's title, the chip shows only the key.
  - The order nav scrolls sideways in a big group and keeps the current person in view. A dot is "done" if the person spoke or comes before the current one. On a narrow window the nav wraps to its own row.
  - Below the panels, the driver sees "{N} people × {m} min is longer than the {total} min meeting" when the plan doesn't fit.
  - The quick-create description is one paragraph "From the {group} standup on {date}", linked to the day page (absolute URL: rich text allows only http(s) links).
- **Day page "Meeting notes"** (not designed): an outlined 12px-radius section after the strip, "Meeting notes" 15/600 with "Run by {name} · N min" (total only, never per person), the notes (pre-wrap) and the created-task cards. It appears after "Save notes to standup". While the meeting runs, an accent-soft banner "{name} is running the standup meeting" with **Join live** (hidden on phones).
- **Split nudge** (not designed): above 12 active members, admins/owners and the facilitator see a warm-card note on the group page (today) and in settings → Members: "30 people is a lot for one standup…".

### 5.6 Empty group — `StandupEmpty.dc.html`
- For a group with no posted update yet (Design team). The header has the group switcher (no icon) + a green "New" pill (#E8F5EC / #166534) and an outline "Group settings" button.
- Centered (max 600, padding 56 24 48, gap 24):
  - an illustration of three ghost speech cards, the middle one dashed accent on accent-soft;
  - h1 20/28 "Start Design team's first standup" and the body (14/22 #52525B);
  - a 30px avatar stack + "4 members" + a schedule chip (24px, #F4F4F5) "Mon–Fri · reminder at 09:30 · Ulaanbaatar (UTC+8)";
  - **Write the first update** (primary 40px) and **Invite members** (outline 40px → group settings, members);
  - "How it works": three cards (#FAFAFB, radius 10, padding 12) with a 24px accent-soft number. 1 Write ("A reminder at 09:30. Suggestions from yesterday's work are pre-filled."), 2 Read & help ("Blockers show first. React or reply in a short thread."), 3 Meet ("Optionally run “Start standup”…").
- Not drawn: **no groups at all** (Standup nav when I'm in no group). Use the same layout with "Create a standup group" (primary).

### 5.7 Group settings — `StandupSettings.dc.html`
- Breadcrumb "Standup › Mobile team › **Settings**". The header holds Cancel (ghost) and **Save changes** (primary 36px), so it's an explicit save form, not autosave.
- Form: max 840, padding 8 24 48. Each section is a grid `240px | 1fr`, gap 24, padding 24 0, with a bottom divider. Left: h2 15/600 + a 13px muted line.
  1. **General** ("The group name is visible to all members."): Group name, a 38px input.
  2. **Members** ("6 members · the facilitator starts the meeting"): a list (radius 10). Rows are min 48px: 28px avatar, name 500, job title 12px muted, a "Facilitator" accent-soft chip, and a 32px × ("Remove Bat O."). After the rows, a 44px "+ Add by name or email…" input. How to make someone facilitator isn't drawn: use a row "…" menu (Make facilitator / Remove facilitator).
  3. **Schedule** ("When people post, get reminded and meet."):
     - **Standup days**: seven toggle buttons Mon–Sun (min 48 × 36, radius 8, 13/600; on = accent border + accent-soft + accent; `aria-pressed`; titles carry the full weekday). Default Mon–Fri;
     - three selects (auto-fit min 180): **Post by** (09:30 / **10:00** / 10:30 / 11:00), **Reminder** (**09:30** / 09:00 / No reminder) and **Meeting** (**10:15** / 10:30 / No meeting (async only));
     - **Timezone** (Ulaanbaatar (UTC+8) / Seoul (UTC+9) / UTC) with the hint "Members in other timezones see times in their own local time." In the build: the full zone picker from Settings and 15-minute steps for the times.
  4. **Meeting mode** ("Settings for the screen-shared meeting."):
     - **Time per person**: segmented 1 / **2** / 3 min;
     - **Speaking order**: segmented **Posting order** / Alphabetical / Random;
     - checkboxes (18px, accent): **Show blockers first** ("Collects every blocker at the top of the group page.", on) and **Mark linked tasks as “Blocked”** ("Tasks linked to a blocker show a marker in List and Board.", on).
- Not drawn: creating a group (a "+" next to the sidebar "Standup groups" heading opens a name-only popover like New space), deleting or archiving a group (danger zone at the bottom), and validation (reminder before post by, post by before the meeting, at least one day).

### 5.8 Data model (built 2026-10-16, phase 1)
Decided by the user's spec, replacing the earlier proposal (no `standup_days` / `standup_items`): see CLAUDE.md "Data model" for the tables. Notes:
- Items are jsonb lists on `standup_entries` (`yesterday`: `{kind: completed|review|commented|text, taskId?, text}`, `today`: `{kind: task|text, taskId?, text}`); blockers are rows (`standup_blockers`, several helpers); meetings are `standup_meetings` (+ `standup_meeting_tasks`).
- `is_late` is stored (posted after `post_by`) but only ever shown for that day.
- One facilitator per group (`standup_groups.facilitator_id`).
- **Out of office** is the new general `user_absences` table (dated periods with a note), replacing `workspace_members.away_until/away_note` (answers Q2).
- **Not touched**: `activity`, `task_references`, the task `updated_at` and Reports.

Built UI: the Standup nav item + dot and the "Standup groups" section (admins' "+" name popover → the new group's settings), the empty state (StandupEmpty.dc.html; "Write the first update" is drawn but `aria-disabled` until posting ships), the no-groups state (admins get a name field + "Create a standup group"), a placeholder header for groups with posts, and the settings page (StandupSettings.dc.html, explicit Save; row "⋯" Make/Remove facilitator; "Add by name or email" opens the member picker, workspace members only (Q12); native selects on 15-minute steps; the shared `TimezonePicker`; when my zone differs, a line "In your time (Seoul (UTC+9)): post by 11:00 · …"; an "Archive group" section with Undo). Times in the empty state's schedule chip are shown in the viewer's zone.

### 5.9 API (`/api/v1`, OpenAPI tag `Standups`)
**Built in phase 2 (2026-10-16)**, following the user's spec rather than the proposal below: `GET /standup-groups/:id/days/:date` (one request for the group page, incl. the caller's draft), `GET /standup-groups/:id/suggestions?date=` (no separate `compose`), `PUT …/days/:date/entry` with `status: draft|posted` (no `POST …/post`, no entry DELETE yet), `POST|DELETE /standup-blockers/:id/resolve`, `PUT|DELETE /standup-entries/:id/reactions/:emoji`, `POST /standup-entries/:id/replies`, `PATCH|DELETE /standup-replies/:id`. Task DTOs carry `blocked: {groupId, groupName, date, text, fromUser} | null`. Realtime: `standup.entry_posted` / `entry_updated` / `blocker_changed` / `reaction` / `reply` to the group's members, `tasks.blocked.changed {taskIds}` to the workspace. Reminder + facilitator digest: `standups/notices-job.ts`. Details: CLAUDE.md "Standups". Meetings (start/end, notes, "Create task") are not built. The original proposal, kept for reference:
- `GET /workspaces/:wid/standup-groups`: my groups with today's state (`meetsToday`, `postBy`, `posted`, `postedCount`/`expectedCount`), used by the sidebar, the nav dot and the My Tasks card. Admins also get groups they aren't in, with name, members and schedule only.
- `POST /workspaces/:wid/standup-groups` · `GET|PATCH|DELETE /standup-groups/:id` (settings) · `PUT|DELETE /standup-groups/:id/members/:userId` (`{ facilitator }`).
- `GET /standup-groups/:id/days/:date` (`today` allowed): the day's strip (members, posted time, late, away + back date), posted entries with items, reactions (counts + mine) and replies, the blockers list (open blockers from earlier days included, see §5.11 Q4), notes, meeting state, plus `prevDate`/`nextDate` (standup days only).
- `GET /standup-groups/:id/days/:date/compose`: my draft, the Yesterday suggestions (minus dismissed), the Today chips, the "yesterday" range and the visible-to count.
- `PUT …/days/:date/entry` saves the draft (items + dismissed). `POST …/entry/post` publishes it. Edit after posting: `PUT` on a posted entry sets `edited_at`. `DELETE` removes my entry.
- `POST|DELETE /standup-items/:id/resolved` (author, helper, facilitator) · `PUT|DELETE /standup-entries/:id/reactions/:kind` · `POST /standup-entries/:id/replies` · `PATCH|DELETE /standup-replies/:id`.
- Meeting: `POST …/days/:date/meeting/start|end` (facilitator, see §5.11 Q5), `PUT …/days/:date/notes`. "Create task" uses the normal create route with `standupItemId`, which sets `created_task_id`.
- Task DTOs in List/Board get `blocker: { text, authorName, date, groupId } | null`, only when the group has `mark_linked_tasks` on and the item is open (redaction: §5.11 Q3).
- Realtime: `standup.changed { groupId, date }` is sent **only to the group's members' sockets** (not the workspace broadcast) and refetches the day. `tasks.blocked.changed { taskIds }` refetches task lists.
- Jobs (in process, one API instance): the reminder at `reminder_at` in the group's zone for members who haven't posted and aren't away, on standup days only.

### 5.10 "Yesterday" (proposed)
- A **standup day** of a group is a date (in the group's timezone) whose weekday is in `days` and which isn't in `workspace_holidays`.
- **Today** T is the group's local date. **Yesterday** P is the latest standup day before T, searching at most 31 days back. Examples:
  - Mon Oct 12 → Fri Oct 9 (Mon–Fri group);
  - a Mon/Wed/Fri group: Wed → Mon, Mon → Fri;
  - Wed Nov 11 → Mon Nov 9 (Tue Nov 10 is Chinggis Khaan's Birthday);
  - Fri Nov 27 → Wed Nov 25 (Thu Nov 26 is Republic Day).
- **As built (phase 2)**: the window runs from P's **post-by time** until now (the user's spec), so activity after Friday's post-by shows on Monday and nothing before it; there is no "reach back to my last post" extension yet. With no P in 31 days, the window starts 7 days back.
- **Suggestion window** (proposal): from the start of P to the start of T, in the group's zone. It covers P plus any non-standup days after it (weekend work shows on Monday). The next window starts where this one ends, so nothing appears twice or gets lost. If I didn't post on P (forgot, away), the window reaches back to the day after my last posted entry, at most 7 days. The legend then adds "since Wed, Oct 7".
- The label stays **Yesterday** / **Өчигдөр** (it names the question). When P isn't the calendar day before T, the hint names the day: "Yesterday · Fri, Oct 9 · suggested from your activity".
- Suggestions come from my own activity rows in the window. **Completed** is `status.changed` into a done category. **Moved to review** is `status.changed` into review. **Commented on** is `comment.added`. Each task appears once, with the strongest kind (completed > review > comment). Deleted tasks and tasks no longer in done/review are skipped.
- **Today chips** come from my open assigned tasks on T: **Overdue** (due < T), **Due today**, then **In progress** (category `in_progress`). Each task appears once, with the strongest tag. At most 8, then "+N more". "Today" here is the group's date, not my own zone. None are pre-selected (the design's pre-selected chips only show the on state; see §5.11 Q11).
- **On a non-standup day** the page opens the latest standup day. Write is disabled with "Next standup Mon, Oct 12". The nav dot and the My Tasks card are off.
- **Expected count** = active group members not away on T. "Back Oct 12" = the first standup day after `away_until`.

### 5.11 Open questions
1. **Answered (2026-10-16)**: only the group's members read and write entries, blockers, reactions, replies and suggestions; other workspace members, admins included, get 403 (settings stay readable by everyone, editable by admins and the facilitator). Notifications follow (they leave the Inbox when someone leaves the group). Was: **Read access.** Groups themselves (list, settings, empty state) are visible to the whole workspace (decided 2026-10-16). Content still open. Proposal (your default): only group members read entries, blockers, replies and notes. Workspace admins/owners manage every group's settings and members but see no content unless they're members. Search, ⌘K and notifications follow the same rule.
2. ~~Out of office~~ **Answered**: a new general `user_absences` table (start, end, note) replaces `away_until` / `away_note`.
3. **Answered (2026-10-16)**: (a). Everyone gets `blocked`; outside the group `text` and `fromUser` are null and the UI shows "Blocked · from {group}'s standup". Was: **The "Blocked" marker outside the group.** Tasks are visible to everyone, but blocker text is group-only. Options: (a) everyone sees "Blocked" and the tooltip text only for group members (others see "Blocked · from Mobile team's standup"); (b) only group members see the marker; (c) turning the setting on publishes the text to everyone. Proposal: (a).
4. **Answered (2026-10-16)**: an open blocker carries over to later days until resolved; the author, helpers, the facilitator and admins in the group resolve it; it doesn't resolve itself when the task is done (the marker hides on done tasks). Was: **Blocker lifetime.** Does an unresolved blocker stay in the Blockers list on later days (with "since Oct 8") until resolved? Proposal: yes. Who can resolve: the author, the helper and facilitators. Should a blocker resolve itself when the linked task is done?
5. **Answered (2026-10-16)**: admins/owners create groups; one facilitator per group; admins and the facilitator edit settings; the facilitator starts and drives the meeting (admins/owners in the group when there's no facilitator or they're out that day). Was: Who creates groups (any member, who becomes facilitator? admins only?), and can more than one person be facilitator? Who can start the meeting: facilitators only, or any member?
6. **Answered (2026-10-16)**: new types `standup_help`, `standup_reply`, `standup_resolved`, `standup_reminder`, `standup_digest` behind one Settings switch "Standups"; mentions in replies are `mention`; reactions don't notify; `notifications.task_id`/`actor_id` are nullable with standup columns (migration 0016). Was: **Notifications.** New types for "you can help" (helper picked), replies and @mentions in replies, and the reminder? `notifications.task_id` is NOT NULL today, so they need a nullable task + `standup_entry_id`, plus prefs toggles. Reactions should not notify (proposal).
7. **Answered (2026-10-16)**: an update is written and edited only on its own standup day (until midnight in the group's zone); no posting for past days; replies, reactions and resolving still work on past days. Was: **Editing and late posting.** Can people edit a posted update all day? Can someone post for a past day (proposal: no; past days are read-only except replies, reactions and resolving)?
8. **Answered (2026-10-16)**: others follow live. The state is the server's (`standup_meetings`: current speaker and turn start, durations, notes), pushed with `standup.meeting_changed`; per-person and total times are recorded but shown only in live mode. Was: **Live meeting state.** It's a screen share, so state is local to the facilitator's screen and only start/end, notes and created tasks are saved. Do you want others to follow along live (synced speaker)? "/ 15:00" is **answered**: a `total_meeting_minutes` group setting (default 15; not in the settings design yet, so not editable in the UI). Syncing others live is still open.
9. **Answered (2026-10-16)**: quick create prefilled (title from the item up to " — ", assignee = the speaker, project = the linked task's, a link back to the standup). Was: **"Create task"** creates instantly (project = the linked task's project, assignee = the speaker), or opens quick create prefilled? Proposal: quick create prefilled, because a project is needed.
10. **Answered**: only the three drawn. Was: Only the three drawn (thumbs up, eyes, heart), or does "Add reaction" open a bigger fixed set?
11. **Today chips.** Pre-select overdue / due today, or nothing?
12. **Answered (default)**: workspace members only. Was: workspace members only, or does an unknown email create a workspace invite?
13. **Retention.** Keep standups forever (readable through ‹ day navigation), or only N weeks?
14. **Dark mode and the МН/EN switches inside the modal and live mode**: derive the dark mode; drop the switches (preview-only)?

## 6. Feedback (built 2026-10-19)

Customer feedback: a public form (no account) and the team's inbox, linked to tasks. Behavior and API: CLAUDE.md "Feedback".

### 6.1 Decisions
- Public URL `/feedback/:slug` (workspace slug, as `kitestudio.app/feedback/kite` in the design). Every active member sees and triages the inbox (submitter emails/phones included).
- No language selector on any feedback page: the designs' МН/EN toggles are preview-only.
- No email service: "Reply by email" and "Notify all" are `mailto:` (BCC); "Email the submitter when the task is done" is stored with a TODO hook.
- Similarity: "Similar tasks" in the link picker (trigram on titles) and a "found N similar reports" log row at submit; no automatic linking.
- Left out (not specified): Privacy/Terms links and "Back to {workspace}" on the success screen; QR download and Embed in the empty state ("Preview the page" opens the form). Notes are plain text (no @mentions).
- Device line is "device · OS · browser" from the user agent (a web form can't know an app version such as the design's "App 4.1.2").
- The panel's assignee is the linked task's assignee (single picker, replaces the task's assignees), disabled until linked.
- The public form uploads each file as soon as it's picked (per-file progress); sending waits for running uploads. 10 MB per file, images/video/PDF only (the design's note), checked by content on the server.

### 6.2 Screens
- **Inbox** (`Feedback.dc.html`): header search + public link pill, type tabs as route tabs (`UnderlineTabs` with a count), status chips (`aria-pressed`), the table (8 columns, 1080px min, scrolls sideways), unread rows tinted with a dot and bold title/date, the dark selection bar replacing the header row (`--selection-bar-*` tokens), "1–50 of N" with ← →.
- **Detail** (`FeedbackDetail.dc.html`, `FeedbackDuplicates.dc.html`): `Drawer` `size="wide"` (66%, min 880px). Duplicates banner (`--fb-banner-*`), "First report" pill on the earliest, the linked reports list in the side column. Image attachments open the task `ImageViewer` (generalized). Notes cards `--fb-note-*`, "team only" pill `--fb-internal-*`.
- **Create task** (`FeedbackCreateTask.dc.html`): 680px `Modal`, project defaults to the first project (its To Do status), priority High for bugs, attachments all checked.
- **Task drawer** (`TaskDetail.dc.html`): "Linked feedback" after "Mentioned in"; Mongolian copy written by us (the design is English only).
- **Public form** (`PublicFeedback.dc.html`): see `features/feedback/public/`; error summary and field error tokens `--form-error-*`, `--field-error-*`.

## Appendix A — Visual reference

### A.1 Palette keys (light → dark; "—" = not drawn, derive)
**Avatars** (bg/fg): indigo #E0E7FF/#3730A3 → #312E81/#C7D2FE · green #DCFCE7/#166534 → #14532D/#BBF7D0 · rose #FFE4E6/#9F1239 → #881337/#FECDD3 · amber #FEF3C7/#92400E → #78350F/#FDE68A · sky #E0F2FE/#075985 → #0C4A6E/#BAE6FD · purple #F3E8FF/#6B21A8 → #581C87/#E9D5FF · teal #CCFBF1/#115E59 → — · yellow #FEF9C3/#854D0E → —.
**Space badges / template tiles**: violet #EDE9FE/#5B21B6 → #2E1065/#DDD6FE · green #DCFCE7/#166534 → #14532D/#BBF7D0 · rose #FFE4E6/#9F1239 → #4C0519/#FECDD3 · sky #E0F2FE/#075985 → —.
**Projects** (pill bg/fg/dot): violet #EFEBFD/#4C3BA8/#7C5CE0 · sky #E2F1FA/#0B5A80/#0284C7 · amber #FCEFDB/#8A4B08/#D97706 · green —/—/#16A34A · rose —/—/#E11D48 · neutral —/—/#A1A1AA. Dark —. Inactive sidebar project dot #C4C4CC → #4A4A52.
**Derived in phase 8** (not drawn; all values in `apps/web/src/styles/palette.css`): every family covers all 13 palette keys. Avatars: missing keys use Tailwind 100/800 light, 900/200 dark (teal #134E4A/#99F6E4, yellow #713F12/#FEF08A, …). Space badges: Tailwind 100/800 light, 950/200 dark (sky #082F49/#BAE6FD, …). Projects: light pill = soft tint of the dot + 800 fg; dark pill = dot at 20% + 300 fg, dot = 400 (violet rgba(124,92,224,.2)/#C4B5FD/#A78BFA). Tags: same pattern as the drawn ones (soft bg + 700/800 fg; dark rgba(500,.16) + 300 fg).
Other derived dark values (`tokens.css`): status tints in-progress rgba(245,158,11,.16)/#FBBF24, done rgba(34,197,94,.16)/#86EFAC, todo #232328/#C9C9D1; segmented active #2E2E34 (track #26262B; sidebar track #1F1F23); `--border-strong` #3A3A42; `--text-body` #C9C9D1; priority none #3A3A42; favorite star #FACC15; tooltip inverted (#EDEDEF/#18181B); scrims rgba(0,0,0,.5/.56).
**Tags** (bg/fg): blue #E8F1FD/#1D4ED8 → rgba(59,130,246,.16)/#93C5FD · violet #F1EEFD/#5B45B8 → rgba(139,116,240,.18)/#C4B5FD · teal #E3F4F1/#0F766E → rgba(20,184,166,.16)/#5EEAD4 · orange #FDF1E1/#9A3412 → rgba(249,115,22,.16)/#FDBA74 · green #E6F4EA/#166534 → rgba(34,197,94,.16)/#86EFAC · pink #FCEBF3/#9D174D → rgba(236,72,153,.16)/#F9A8D4 · neutral #F1F1F3/#3F3F46 → #232328/#C9C9D1.
Seed mapping: Research/Checkout=blue, UX/UI=violet, Design system=teal, Analytics=orange, A11y/Mobile web=green, Onboarding=pink, Frontend/iOS/Android/Docs=neutral.

### A.2 Status, priority, due, accent
- Status marker 12px (2px ring): todo #A1A1AA → #71717A; in_progress ring + left-half fill #D97706 → #F59E0B; review ring accent + accent 20% fill → ring accent-ink + accent-soft; done solid #16A34A → #22C55E.
- Status tints (pills, board headers): todo #F1F1F3/#3F3F46 (board header #EDEDF0); in_progress #FDF0DC/#92400E; review accent-soft/accent; done #E3F4E8/#166534.
- Priority: urgent #DC2626 → #F87171; high #EA580C → #FB923C; medium #CA8A04 → #FACC15 (filled); low outline #A1A1AA → #71717A.
- Due: overdue #C42B1C/500 (Board 600) → #F87171; today #B45309/500 → #FBBF24; soon #3F3F46 → #C9C9D1; later #6B6B74 → #8E8E98; done #A1A1AA (Board #6B6B74) → #5E5E68.
- Accent ink (dark): #6E56CF→#B4A5FF, #2F6FEB→#93B4FF, #0F766E→#5EEAD4, #3F3F46→#D4D4D8. Soft: light accent+1A, dark accent+33.
- Misc: online #16A34A → #22C55E; danger soft #FDECEC/#B42318; danger card border #F3D3CF bg #FFF8F7; history marker default #C4C4CC; week bars past accent+66, future #E6E6EA; calendar weekend #FCFCFD, other month #FAFAFB.

### A.2b Reports (light → dark; dark from `ReportsDark.dc.html`)
- Panels: light `--surface`/`--bg` #FFFFFF → dark **#161618** (not `--surface` #1F1F23) = new `--panel`. Table header `--bg-subtle` → #18181B; row dividers `--border-subtle` → **#222227**.
- Chart: gridline #F1F1F3 → #222227; baseline #D4D4D8 → #3A3A42; previous series / reference #C4C4CC → #6B6B75; hover line #D4D4D8 → #3A3A42; main series accent → accent-ink; point ring `--bg` → panel #161618; neutral bar #8B8B94; warm bar #E39B2B; "No due date" hatch #F4F4F5/#D4D4D8 + border #C4C4CC (dark: derive).
- Chart tooltip: surface, border #E6E6EA, radius 8, `0 8px 24px rgba(24,24,27,.10)` → #1F1F23, border #2E2E35, `0 8px 24px rgba(0,0,0,.4)` (= new `--shadow-tooltip`).
- Wait bars: To Do #8B8B94 → #9A9AA4; In Progress #D97706 → #F59E0B; In Review accent → accent-ink; track #F4F4F5 → #232328. Dark In Review marker fill = accent-ink + 40.
- Success-soft (good delta, Current pill, Light pill) #E8F5EC/#166534 → rgba(34,197,94,.16)/#86EFAC. Warning-soft (Stale, Replan, Heavy, scope chips, burndown insight) #FEF3E2/#92400E (insight icon #B45309) → rgba(251,191,36,.14)/#FCD34D. Warm card #FFFBF5 border #F5DDB8 value #92400E → derive. Danger card (dark) bg rgba(248,113,113,.07), border rgba(248,113,113,.28), value #F87171.
- Sprint chart (default accent): committed #9C8BE3, completed #5B45B8; other accents: accent+73, accent; added #D97706 (dark, derived: committed accent-ink+73, completed accent-ink, added #F59E0B). Carried swatch / unflagged pips #8B8B94 (dark #9A9AA4), empty pip #E6E6EA (dark #2A2A30). Warm card #FFFBF5 / #F5DDB8 / #92400E → dark (derived) rgba(251,191,36,.06) / rgba(251,191,36,.24) / #FCD34D. Workload pill dots Heavy #E39B2B, Balanced #8B8B94, Light #16A34A → dark #E8A33D / #9A9AA4 / #22C55E.
- Stat icons: completed #16A34A → #4ADE80; on-time #0284C7 → #7DD3FC; cycle accent → accent-ink; overdue #C42B1C → #F87171.
- Dark segmented (Reports): track #1F1F23, active #2E2E35 with `0 1px 2px rgba(0,0,0,.3)` (tokens keep #2E2E34).
- Skeleton shimmer #F1F1F3 / #E7E7EB (dark: derive from `--surface-2`).

### A.3 Sizes, radii, shadows, type
- Heights: header 56, tabs 40, group header 40, table header 36, rows 44/36, subtask row 40, sidebar nav 32, project item 30, buttons 32 (CTA 40, small 28/30), picker search 38, option 32 (mention 34), chips 22–30.
- Radii: 3 (kbd in chips) · 4 (kbd, 16px badges, code) · 5 (18px badges, lang segments) · 6 (tags, small icon buttons, options, pills) · 7 (lang track) · 8 (controls, nav, segmented tracks) · 10 (cards, popovers, editor) · 12 (panels) · 14 (modal) · full (pills, avatars).
- Shadows: segment `0 1px 2px rgba(24,24,27,.08)` · popover `0 8px 24px rgba(24,24,27,.12)` · popover-lg `0 12px 32px rgba(24,24,27,.14)` · drawer `-12px 0 32px rgba(24,24,27,.10)` · modal `0 24px 64px rgba(24,24,27,.20), 0 2px 6px rgba(24,24,27,.06)` · drag `0 2px 4px rgba(24,24,27,.06), 0 16px 32px rgba(24,24,27,.14)` · ring-soft `0 0 0 3px accent-soft` · tooltip (Reports charts) `0 8px 24px rgba(24,24,27,.10)`, dark `0 8px 24px rgba(0,0,0,.4)`. Scrims: drawer .28, modal .32 of #18181B.
- Type: Geist 10 (initials in 24px report avatars, scope chips) · 11/12/13/14(20) · 15/20 (Reports panel headings) · 16/22 (People picker name) · long-form 14/22 #27272A · 18/24 (calendar title, Reports section headings) · 20/26 (Reports help tiles) · 20/28 · 22/30 · 24/32 · 26/32 (secondary stat values) · 28/32; numbers in tables use `tabular-nums`; headings 600, −0.01em at ≥20. Geist Mono 12 for keys/code.

### A.4 Formats
| Context | en | mn |
|---|---|---|
| Due cell | Today · Tomorrow · Oct 14 | Өнөөдөр · Маргааш · 10-р сарын 14 |
| This Week due | Fri, Oct 9 | draft |
| Board overdue | Oct 7 · Overdue | draft |
| Drawer due | Today, Oct 8 · Started Oct 4 | draft |
| Date range | Oct 6 – Oct 24 | 10-р сарын 6 – 24 |
| Page date | Thursday, October 8 | draft |
| Calendar | October 2026 · Oct 5 – 11, 2026 · "Oct 1" on the 1st | draft |
| Relative | feed "2h ago"; drawer "2 hours ago", "Yesterday, 4:12 PM", then "Oct 1" | draft |
| File size | 248 KB | 248 KB |
| Reports week label | Jul 20 · tooltip "Week of Oct 5" | 7/20 · "10/5-ны долоо хоног" |
| Reports range | Sep 12 – Oct 9 · compared with the previous 4 weeks (Aug 15 – Sep 11) | 9-р сарын 12 – 10-р сарын 9 · өмнөх 4 долоо хоногтой (…) харьцуулав |
| Sprint name | Sprint 14 · short S14 | 14-р спринт · short С14 |
| Durations | 3.2 days · reply 2h | 3.2 хоног · 2ц |

Add the year when the date is outside the current year.

## Appendix B — Mongolian glossary (from `Main.dc.html` STR.mn)
| en | mn |
|---|---|
| Workspace / Search | Ажлын орчин / Хайх |
| Collapse / Expand sidebar | Хажуу самбарыг хураах / дэлгэх |
| My Tasks / Inbox | Миний ажлууд / Мэдэгдэл |
| Spaces / New space | Орон зай / Шинэ орон зай |
| Language / Invite teammates / Settings / Online | Хэл / Хамт олноо урих / Тохиргоо / Онлайн |
| Breadcrumb / Add to favorites | Байршил / Дуртайд нэмэх |
| 7 project members / Share / Project options | Төслийн 7 гишүүн / Хуваалцах / Төслийн сонголтууд |
| View / Filter / Sort: Due date / Group: Status | Харагдац / Шүүлтүүр / Эрэмбэ: Дуусах огноо / Бүлэглэх: Төлөв |
| New Task / Add task | Шинэ ажил / Ажил нэмэх |
| Sprint is / Remove filter | Спринт: / Шүүлтүүрийг арилгах |
| Task name / Assignee / Due date / Priority / Tags / Actions / Complete | Ажлын нэр / Хариуцагч / Дуусах огноо / Ач холбогдол / Шошго / Үйлдэл / Дууссан |
| List / Board / Calendar | Жагсаалт / Самбар / Календарь |
| To Do / In Progress / In Review / Done | Хийх / Хийгдэж буй / Хянагдаж буй / Дууссан |
| Urgent / High / Medium / Low | Яаралтай / Өндөр / Дунд / Бага |
| Today / Tomorrow | Өнөөдөр / Маргааш |
| tasks / done | ажил / дууссан |
| МН / EN | Монгол / English |

Patterns: `«{name}» ажлыг дууссан гэж тэмдэглэх` (mark complete), `«{name}» — нэмэлт үйлдэл` (more actions), `«{group}» бүлэгт ажил нэмэх` (add to group), `{project} төслийн ажлууд` (table label). Quotes «…». Dates `{m}-р сарын {d}`.
