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

## 1. Screens

### 1.1 App shell + List — `Main.dc.html`
**On screen**
- **Sidebar** (248px, min 220): workspace button (accent "K" tile, "Kite Studio", ⇅) + collapse; search field with ⌘K kbd; My Tasks (open count), Inbox (accent unread badge); "Spaces" + new-space button; space tree (chevron, 18px space badge, name) → projects (6px dot; active = accent-soft bg, accent text, accent dot); footer: Language МН/EN segmented, Invite teammates, Settings, me (avatar, full name, online dot).
- **Rail** (56px): K tile, expand, search, My Tasks, Inbox, divider, 22px space badges, МН/EN cycle button at bottom.
- **Top bar** row 1 (min 56px): breadcrumb (space badge + space › **project**), favorite star; right: member stack (4 × 26px + "+3"), Share, project options (…). Row 2: tabs List/Board/Calendar (40px, accent underline) + toolbar: Filter (count badge), Sort: Due date, Group: Status, divider, + New Task.
- **Filter strip**: removable chip "Sprint: 10-р сарын 6 – 24" / "Sprint is Oct 6 – Oct 24"; summary "16 tasks · 4 done".
- **Table** (min 960px, scrolls horizontally): grid `40px | 1fr | 152 | 120 | 112 | 224 | 40`, header 36px. Groups by status (To Do, In Progress, In Review, Done; Done collapsed by default): header 40px = chevron, status dot, label, count, +. Rows 44px (36 compact): checkbox · title (+ ↳ "3/5" subtasks, 💬 count) · avatar + name · due (tone) · flag + priority · tag chips (clipped) · "…" (shown on hover/focus). "+ Add task" closes each group. List is sorted by due date.

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
**On screen**: sidebar My Tasks active (accent-soft, 600). Header "My Tasks" + All spaces filter, Group: Due date, + New Task. Left: "Thursday, October 8", h1 24/32 "Good morning, Anu". Stat cards (auto-fit ≥200px, radius 12, padding 16): **Due today** "3 · of 4 left · 1 urgent" (clock #B45309); **Completed this week** "7 · +3 vs last week" (#166534) + 7 bars Mon–Sun (8px, h=max(4, n·8) in 32px; past accent 40%, today accent, future #E6E6EA; aria-label lists counts); **Overdue** danger card (border #F3D3CF, bg #FFF8F7, value #C42B1C, "oldest is 2 days late"). Sections (min 640px): Overdue (red label, #FDECEC/#B42318 count, hint "Reschedule or close these first"), Today ("Thursday, Oct 8"), This Week ("Fri, Oct 9 – Sun, Oct 11"), Later ("After this week"); header 40px chevron + label + open count + hint; rows grid `32 | 1fr | 168 | 100 | 88` 44px: checkbox, title, 16px space badge + project, due (section tone; "Fri, Oct 9" style in This Week), priority; "+ Add task" per section. Right panel (max 360, radius 12) "Recent activity" + "View inbox": avatar, "**Dorj E.** mentioned you in **task**", optional quote box (#F7F7F8, one line), "2h ago · App Redesign", unread accent dot; "Show older activity".

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
**On screen**: sidebar: new project active + "New" badge (white pill, accent text). Header: breadcrumb, single avatar, Share. Tabs; Filter disabled; + New Task. Center (max 560): illustration (ghost rows card, accent + bubble), h1 20/28 "Partner Portal has no tasks yet", body, actions: Create first task (primary 40px, kbd C), Import from CSV (secondary → disabled, "Coming soon"), Invite teammates (ghost). "Or start from a template": 3 cards (28px colored icon tile, name 13/600, desc 12px): Product launch "18 tasks across planning, build and go-live", Sprint planning "12 tasks for a two-week cycle", Bug triage "6 tasks plus priority and severity fields".
**Interactive**: create (modal), apply template, invite.
**Data**: project (name, members, task count 0, created_at); static templates.

### 1.9 Inbox (empty) — `EmptyInbox.dc.html`
**On screen**: sidebar Inbox active. Header h1 "Inbox" + Mark all as read (disabled when none unread) + bell icon (notification settings). Tabs All / Mentions / Assigned to me / Archived. Empty state (max 440): 112px circle with inbox icon + green ✓ badge, h2 "You're all caught up", body (mentions, assignments, comments on followed tasks; read → Archived after 30 days), Go to My Tasks (primary), Notification settings (secondary), "View 24 archived notifications", tip "press G then I".
**Interactive**: tabs, mark all read, notification settings, archived link, G-then-I chord.
**Data**: notifications per tab, unread count, archived count. Populated list is not designed → reuse the My Tasks feed row (avatar, actor + verb + task, quote, time · project, unread dot) + hover actions (mark read, archive).

## 2. Gaps vs the data model

### 2.1 Schema changes (decided; CLAUDE.md updated)
| Need (where) | Change |
|---|---|
| Dark variants of avatar/space/project/tag colors; project bg/fg/dot triple (ListDark, Calendar) | Palette keys: `users.avatar_color`, `spaces.color`, `projects.color`, `tags.color` (drop `color_bg/color_fg`). |
| Bilingual default status names | `statuses.name` nullable → translated by category. |
| Role hints (TaskDetail mentions, CreateTask assignee picker) | `workspace_members.title` nullable text. |
| Notification settings (Inbox) | `users.notification_prefs jsonb` `{mention, assigned, comment, status}` booleans, default true; checked during fan-out; UI in `/settings`. |
| Online dots | Not stored. WS server keeps presence in memory (Phase 16); until then only my own dot. |

### 2.2 Derived (computed in queries, never stored)
- **Sidebar**: My Tasks = my open tasks (not done, not deleted) in workspace; Inbox = unread, unarchived notifications.
- **Project**: member count + first 4 for the stack ("+N"); "New" badge = created ≤ 7 days ago.
- **List/Board**: group/column counts, "N tasks · M done" (after filters), subtask done/total, comment count, Board tag "+N".
- **Task**: key = `projects.key-number`; "Updated 2 hours ago" from `updated_at`; reply count via `parent_id`; attachment count.
- **People**: short name "Anu B." (first + last initial), first name for greeting, full name in sidebar footer — all from `users.name`.
- **Due tone** (user TZ): overdue (< today) · today · soon (tomorrow → Sunday of current Mon–Sun week; tomorrow always soon) · later · done.
- **My Tasks**: sections overdue / today / this week (tomorrow–Sunday) / later (after Sunday, then no-due tasks last); stats due-today open/total/urgent, completed this week (my tasks with `completed_at` Mon–Sun) + delta, per-day counts, overdue count + oldest days late; feed unread = my notification for that `activity_id` unread.
- **Inbox**: archived count. **Calendar**: unscheduled count, "+N more".
- **Activity lines + marker colors** from `activity.type` + payload. Payload snapshots display data so renames/deletes don't break history: `status.changed {from:{id,name,category}, to:{…}}`, `priority.changed {from,to}`, `due.changed {from,to}`, `assignee.added/removed {user:{id,name}}`, `attachment.added {attachmentId, filename}`, `subtask.completed {subtaskId, title}`, `comment.added {commentId}`.

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

### 2.5 Not designed (derive from existing language)
Login, invite accept, Settings, ⌘K palette, shortcuts help, filter/sort/group menus, all "…" menus, toasts, skeletons, errors, populated Inbox, `/t/:key` page, Share dialog, workspace switcher menu, new space/project dialogs, notification settings, space-level List/Board, dark mode outside List. Rules: popovers/menus = surface, 1px border, radius 10, padding 4, `--shadow-popover`, 32px options with 6px radius, accent ✓ on selected; dialogs = modal style.

**Login / invite accept (derived, phase 3)**: page `--bg-subtle`; 56px header with 24px accent "K" tile + "Kite" (14/600) left and the МН/EN segmented switcher (default track `--surface-2`) right. Centered card 400px max, top offset `min(12vh, 112px)`, `--surface`, 1px `--border`, radius 14, padding 32, `--shadow-modal`. Title 20/28 600 −0.01em, subtitle 13px muted. Fields: label 13/500 `--text-2` above a 38px input (radius 8, `--border-control`, `--control` bg, focus ring 2px accent-ink offset 1 on the field); password fields have a 28px show/hide icon button. Primary button 40px full width. Form error banner: danger soft `#FDECEC/#B42318`, radius 8, 13/500, `role="alert"`.

### 2.6 PROMPTS.md vs designs (resolved; PROMPTS updated)
- Checkbox is native square 16px with `accent-color` (not round).
- List tags: all chips, clipped by the cell; "+N" only on Board.
- Drawer breadcrumb `project › KEY`; min width 520.
- Board done cards: muted title + green check icon, no strike.
- Calendar month: ≤3 tasks show all; >3 → 2 + "+N more".
- Week chart = current Mon–Sun week.

## 3. Reusable components

Primitives in `apps/web/src/components/ui`, composites in feature folders. `PaletteKey`, `StatusCategory`, `Priority`, `UserLite`, `TagLite` come from `packages/shared`.

### Identity & metadata
| Component | Props | Used in |
|---|---|---|
| `Avatar` | `user: UserLite`, `size?: 20\|22\|24\|26\|28`, `ring?: boolean` (2px bg border for stacks), `title?` | everywhere |
| `AvatarStack` | `users`, `max?`, `size?: 24\|26`, `label` (aria, "7 project members") — renders "+N" chip | top bar, Board cards, List cell |
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

## Appendix A — Visual reference

### A.1 Palette keys (light → dark; "—" = not drawn, derive)
**Avatars** (bg/fg): indigo #E0E7FF/#3730A3 → #312E81/#C7D2FE · green #DCFCE7/#166534 → #14532D/#BBF7D0 · rose #FFE4E6/#9F1239 → #881337/#FECDD3 · amber #FEF3C7/#92400E → #78350F/#FDE68A · sky #E0F2FE/#075985 → #0C4A6E/#BAE6FD · purple #F3E8FF/#6B21A8 → #581C87/#E9D5FF · teal #CCFBF1/#115E59 → — · yellow #FEF9C3/#854D0E → —.
**Space badges / template tiles**: violet #EDE9FE/#5B21B6 → #2E1065/#DDD6FE · green #DCFCE7/#166534 → #14532D/#BBF7D0 · rose #FFE4E6/#9F1239 → #4C0519/#FECDD3 · sky #E0F2FE/#075985 → —.
**Projects** (pill bg/fg/dot): violet #EFEBFD/#4C3BA8/#7C5CE0 · sky #E2F1FA/#0B5A80/#0284C7 · amber #FCEFDB/#8A4B08/#D97706 · green —/—/#16A34A · rose —/—/#E11D48 · neutral —/—/#A1A1AA. Dark —. Inactive sidebar project dot #C4C4CC → #4A4A52.
**Tags** (bg/fg): blue #E8F1FD/#1D4ED8 → rgba(59,130,246,.16)/#93C5FD · violet #F1EEFD/#5B45B8 → rgba(139,116,240,.18)/#C4B5FD · teal #E3F4F1/#0F766E → rgba(20,184,166,.16)/#5EEAD4 · orange #FDF1E1/#9A3412 → rgba(249,115,22,.16)/#FDBA74 · green #E6F4EA/#166534 → rgba(34,197,94,.16)/#86EFAC · pink #FCEBF3/#9D174D → rgba(236,72,153,.16)/#F9A8D4 · neutral #F1F1F3/#3F3F46 → #232328/#C9C9D1.
Seed mapping: Research/Checkout=blue, UX/UI=violet, Design system=teal, Analytics=orange, A11y/Mobile web=green, Onboarding=pink, Frontend/iOS/Android/Docs=neutral.

### A.2 Status, priority, due, accent
- Status marker 12px (2px ring): todo #A1A1AA → #71717A; in_progress ring + left-half fill #D97706 → #F59E0B; review ring accent + accent 20% fill → ring accent-ink + accent-soft; done solid #16A34A → #22C55E.
- Status tints (pills, board headers): todo #F1F1F3/#3F3F46 (board header #EDEDF0); in_progress #FDF0DC/#92400E; review accent-soft/accent; done #E3F4E8/#166534.
- Priority: urgent #DC2626 → #F87171; high #EA580C → #FB923C; medium #CA8A04 → #FACC15 (filled); low outline #A1A1AA → #71717A.
- Due: overdue #C42B1C/500 (Board 600) → #F87171; today #B45309/500 → #FBBF24; soon #3F3F46 → #C9C9D1; later #6B6B74 → #8E8E98; done #A1A1AA (Board #6B6B74) → #5E5E68.
- Accent ink (dark): #6E56CF→#B4A5FF, #2F6FEB→#93B4FF, #0F766E→#5EEAD4, #3F3F46→#D4D4D8. Soft: light accent+1A, dark accent+33.
- Misc: online #16A34A → #22C55E; danger soft #FDECEC/#B42318; danger card border #F3D3CF bg #FFF8F7; history marker default #C4C4CC; week bars past accent+66, future #E6E6EA; calendar weekend #FCFCFD, other month #FAFAFB.

### A.3 Sizes, radii, shadows, type
- Heights: header 56, tabs 40, group header 40, table header 36, rows 44/36, subtask row 40, sidebar nav 32, project item 30, buttons 32 (CTA 40, small 28/30), picker search 38, option 32 (mention 34), chips 22–30.
- Radii: 3 (kbd in chips) · 4 (kbd, 16px badges, code) · 5 (18px badges, lang segments) · 6 (tags, small icon buttons, options, pills) · 7 (lang track) · 8 (controls, nav, segmented tracks) · 10 (cards, popovers, editor) · 12 (panels) · 14 (modal) · full (pills, avatars).
- Shadows: segment `0 1px 2px rgba(24,24,27,.08)` · popover `0 8px 24px rgba(24,24,27,.12)` · popover-lg `0 12px 32px rgba(24,24,27,.14)` · drawer `-12px 0 32px rgba(24,24,27,.10)` · modal `0 24px 64px rgba(24,24,27,.20), 0 2px 6px rgba(24,24,27,.06)` · drag `0 2px 4px rgba(24,24,27,.06), 0 16px 32px rgba(24,24,27,.14)` · ring-soft `0 0 0 3px accent-soft`. Scrims: drawer .28, modal .32 of #18181B.
- Type: Geist 11/12/13/14(20) · long-form 14/22 #27272A · 18/24 · 20/28 · 22/30 · 24/32 · 28/32; headings 600, −0.01em at ≥20. Geist Mono 12 for keys/code.

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
