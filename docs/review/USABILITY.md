# Kite Tasks — usability field test

Date: 2026-10-13 (the app's "today"). Tester: usability researcher, driving the running dev app (Vite :5173 → API :3000) with Playwright, judging only what a user sees. No code was read to explain behaviour; where a number is quoted it was checked in the database afterwards, not used to drive the test. Data: `pnpm db:scenario small` ("Nomad Labs", 7 people, 304 tasks) and `pnpm db:scenario large` ("Altai Group", 120 members + 9 leavers, 60 projects, ~25k tasks), both in the same database. Everyone's password is `password123`. UI language was Mongolian unless the person's own setting is English (Saruul, Bat-Erdene Tsogt, Anna Müller, Daniel Park). Clicks count mouse clicks and option picks; keystrokes are listed separately. Times are wall-clock for a person who already knows the app.

Screenshots: `docs/review/screenshots/`. The 10-user concurrency run is a script (`apps/web` Playwright, 10 browser contexts); its output is quoted inline.

## Verdicts

**7-person team (Nomad Labs): would adopt it over a spreadsheet — cautiously.** The daily loop (create a task in ~45 s, board, drawer, comments, @mentions, inbox, My Tasks) is fast, bilingual and pleasant, and the Reports tab answers "what's overdue / what's stuck" in one screen. What would make them give up:

1. **Delete is unrecoverable from the UI** although the confirm says "Дараа нь сэргээх боломжтой" (can be restored later) — F-03.
2. **No bulk actions.** Sprint planning is 4 clicks per task, a two-week handover is 6 clicks per task × 14 tasks; the lead gives up and does it in a spreadsheet anyway — F-05.
3. **Typed @mentions that don't notify.** The designer's "@Тэмүүжин харж өгөөч" went out as plain text; nobody was told — F-04.
4. **Mark-done is one click, instant, no undo**, and the task vanishes from the only screen that showed it — F-11.
5. **No "what did everyone finish last week" list** — counts only, one person at a time, with typed dates. The Monday standup still needs a side document — F-15.

**120-person company (Altai Group): would not adopt as-is.** The same loops work, reports stay under a second on a year of data, and the five numbers I checked by hand were exact. But the first Monday morning breaks it:

1. **API rate limit of 300 requests/min per IP.** Ten people behind the office NAT opening one board produced 254 × `429` and blank screens — F-01.
2. **Login limit of 10 per minute per IP, counting successful logins.** Person 11 sees "Хэт олон удаа оролдлоо" with no wait time — F-02.
3. **Notification firehose with no controls.** The PMO received 385 notifications in one day (644 unread), there is no unfollow, mute or per-project setting — F-06.
4. **A 3,000-task project ships 2.9 MB of JSON to open the List** (21 s on Fast 3G) and the Board renders 2,993 cards, 2,564 of them Done — F-07.
5. **People and projects don't scale in the chrome**: no "my projects" among 55, Latin/Cyrillic name search is literal ("Bat" ≠ "Бат"), two people render as the same "Бат-Эрдэнэ Г.", Workload says everyone is "Ачаалал их" — F-08, F-09, F-13.

## Scenario results

| # | Scenario (role) | Completed | Clicks / keys | Time | Friction |
|---|---|---|---|---|---|
| 1 | Monday standup (Номин, lead) | Partly | 9 clicks + 2 typed dates | ~3 min | "Last week" needs Custom period typed as `YYYY-MM-DD`; per-person results are counts on the People tab, one person per visit, no list of completed tasks; Workload marks the person on vacation as "heavy" with no away marker. Overdue and Aging are one click and clear. |
| 2 | Sprint planning (Номин) | Partly | New sprint 3 clicks; 4 clicks per task to move; 3 per reassignment | ~10 min for 21 tasks | No multi-select; sprint picker only in the drawer; reassign picker is multi-select so "move to Saruul" needs an explicit deselect of Тэмүүжин; picker shows no load; Sprints report "Дахин төлөвлөх" link is the only shortcut. Report shows "Шилжиж ирсэн 0" (carried over 0) after a replan. |
| 3 | Vacation handover (Энхтуул) | Partly | 6 clicks per task × 14 | ~8 min | My Tasks has no assignee column; no "reassign all", no out-of-office, reviewer role stays with her. |
| 4 | New joiner's first day (Saruul, EN) | Yes / understand project: No | 3 clicks to project, 1 to task, 1 comment + ⌘↵ | 2 min | Onboarding tasks visible at once; project has no description or goals; project opens pre-filtered to the current sprint (27 of 139 tasks); project name in My Tasks row isn't a link; sidebar state leaked from the previous user on the same browser. |
| 5 | Customer bug (Тэмүүлэн, owner) | Yes | 9 clicks (`C`, title, Бусад талбар, priority, assignee, due, create) | ~45 s | Priority hidden behind "Бусад талбар"; default project is silently the last visited; assignee picker doesn't show that Оюунаа is away; new task isn't in the current sprint; no follow/watch control to "follow it". |
| 6 | Designer reviews 5 In-Review tasks (Хулан → Тэмүүжин) | Yes, with a trap | ~20 clicks + 5 comments | <1 min; dev reply 4 clicks | Board hides 4 of 7 In-Review tasks behind the default sprint filter; removing it shows 90 Done cards. The typed @mention became plain text. Inbox → notification → drawer → Reply works well. |
| 7 | Friday: what did I finish, what's left (Тэмүүжин) | Partly | 2 clicks | 30 s | "Энэ долоо хоногт дууссан 6" is a non-clickable count with a sparkline; Reports → Миний гүйцэтгэл also counts only; "what's left" = My Tasks (23 overdue). The list of finished tasks exists only in the CSV export. |
| 8a | Wrong task marked done (Энхтуул) | Yes, hard | 1 accidental click; recovery ⌘K + 1 pick + 1 click | ~1 min | No undo, no Done section on My Tasks; search shows 7 identical titles with no status; drawer header "Дуусаагүй болгох" restores the previous status correctly. |
| 8b | Task deleted by accident (Тэмүүжин) | **No** | 2 clicks + native confirm | — | Confirm promises restore; nothing restores it: no toast, not in search, the task page still opens (editable, no banner), its menu offers only "Устгах" again. |
| 9 | New hire finds their projects (Мишээл) | Partly | 10 clicks to expand spaces | 2 min | 55 projects in a 2,539 px sidebar, no membership marker, no favourites/"my projects"; she is in 7 (2 archived) and cannot tell which. Own tasks: immediate. |
| 10 | Assign to the right "Bat-Erdene" (Отгонбаяр, EM) | Yes | 3 clicks + typing | 30 s | Picker groups "Төслийн баг / Бусад" and shows full name + title (good). Search is script-literal: "Bat" finds only Latin spellings, "Бат-Эрдэнэ" only Cyrillic; "Бат" matches 21 people including family names. Lists then show both Ганболд and Гантулга as "Бат-Эрдэнэ Г.". |
| 11 | Search: old task by one word; a comment | Partly / No | ⌘K + typing | 0.3 s per query | Results capped at 20, no date/project/status filters: "idempotency" has 176 matches, the three-month-old one is unreachable. Comments aren't searched ("connection pool", "Root cause" → "Илэрц олдсонгүй"). Key search works. |
| 12 | Department head checks workload (Ганхуяг, sales) | Partly | 3 clicks | 1 min | All-workspace view: 120 rows, 7,209 px. Scoped to one space: 15 rows, every one "Ачаалал их" (capacity 15 vs 26–209 open points) so nothing stands out; includes the PMO; two spaces at once impossible. Loads in 0.5 s. |
| 13 | Engineering asks design for something (Отгонбаяр) | Partly | `C`, project picker (search "дизайн"), assignee, create | 1 min | Project picker is a flat searchable list of 55 (fine). No way to link the request to PAY-2401 (key in title stays plain text), no dependency, no "created by me" view; the requester tracks it only through notifications. |
| 14 | Busy person in 41 projects (Номин Г., PMO) | No | — | — | My Tasks: 97 open rows (40 overdue, 50 later), 5,021 px. Inbox: 644 unread, 30 per page + "load more", "mark all read" exists, no filter by project, no mute. One simulated day: **385 notifications** (267 comments, 101 status, 9 assigned, 8 mentions); CTO 261 and QA lead 182 in the last 24 h. |
| 15 | Employee leaves — offboard as admin (Ану Д., HR) | No | — | — | Settings → Гишүүд lists 120 people with 240 inline inputs and no search; a member can only have role/title/capacity changed. No remove, no deactivate, no "their open tasks", no bulk reassign. Their tasks, mentions and reports stay exactly as they are (the 9 pre-existing leavers still own 6–55 open tasks each). |
| 16 | 1,000+ task project (HELP, 2,993 tasks) | Yes on LAN, No on 3G | 1 click per view | List 1.8 s, Board 5.4 s, Calendar 0.4 s | List payload 2.9 MB; scroll is smooth (0 frames > 50 ms over 19,287 px). Board draws all 2,993 cards (2,564 Done). On Fast 3G the List takes 21 s. Filters work (assignee filter lists 121 with search). |
| 17 | 10 people editing the same project | Blocked | script | — | 10 users on one IP: 254 `429 RATE_LIMITED` across sidebar/tasks/activity/sprints/comments; board never loaded for anyone. Re-run with 3 users: no errors, title/priority converge to the last write in ~2 s with no warning that someone else just edited, 3/3 comments visible to all, drags fine. |
| 18 | Permissions (Мишээл, member) | Yes | — | — | UI hides admin controls; API answers 403 for role/title/invite/people-report and 404 for another workspace's data (correct). A member can create spaces and projects but cannot archive one, so a mistaken project is stuck (the test space had to be removed in the database). Archived projects are visible to members. |
| 19 | Reports on a year of data | Yes | 1 click per tab | 0.75–0.85 s per report | Spot-checked 6 numbers (below): all exact. Readability: "Шилжиж ирсэн 0" for a sprint that followed one with 42% unfinished; Workload all red. |
| 20 | Sidebar, pickers, dropdowns at scale | Partly | — | tag picker opens in 80 ms | Tag picker: 305 options, 9,760 px list, search works in Cyrillic, no inline "create tag". Assignee picker: 120. Project pickers: 55/56 flat with search. Sidebar: 70 tab stops, 2.5 k px. |
| X1 | Fast 3G | — | — | My Tasks 4.8 s to content (skeletons shown), HELP List 21 s, drawer 1.5 s, board switch 4.9 s | One 2.9 MB response dominates. |
| X2 | API down mid-action | Partly | — | — | Status change rolls back with "Сервертэй холбогдож чадсангүй…" (good); comment fails with a toast and keeps the draft (good); navigating anywhere shows "Алдаа гарлаа … Хуудсыг дахин ачаалах" and the page stays dead after the API is back until a manual reload. The server never received the change. |
| X3 | Back/forward | Yes | — | — | Back closes the drawer, then returns to List, then to My Tasks; forward reopens the drawer. Esc pushes history, so Back after Esc reopens the drawer. Filters live in the URL and survive reload. |
| X4 | Keyboard only, 10 min | Partly | — | — | No skip link: 45 Tabs from My Tasks to the first task (70+ if the sidebar was left expanded). `G I`, `C`, ⌘K, Enter/Esc, ⌘↵ all work; dnd-kit keyboard drag announces moves. The drawer is not focus-trapped (Tab leaves it after 41 stops) and focus is not restored on close. The status listbox opens with the first item highlighted, not the current one: ↓ ↵ changed "Хянагдаж буй" to "Хийгдэж буй", and ↑ ↵ to "Дууссан". |

Report spot-checks (Altai Group, as a member, period "Сүүлийн 4 долоо хоног"): Completed 2,328 ✓ · On time 42% (565 of 1,335) ✓ · Overdue 1,941, oldest 359 days ✓ · Throughput week of 10/5 = 608 ✓ · Workload Солонго Д. 81 tasks / 209 points ✓ · PAY sprint 27 committed 60 / added 21 / done 16 ✓.

## Findings (by severity)

### Blocker

**F-01 · 300 API requests/min per IP blocks a shared office** — Large · S17, S16 · any role.
Steps: 10 people sign in from one IP and open the WEBP board with the same task open (`apps/web` script, 10 contexts).
What happened: 254 responses were `429 {"error":{"code":"RATE_LIMITED"}}` on `/sidebar`, `/projects/:id`, `/projects/:id/tasks`, `/tasks/:id/activity`, `/sprints`, `/comments`; `x-ratelimit-limit: 300`, reset 20 s. Nobody's board loaded; drags and comments were lost. A single person opening HELP spends ~25 requests, so 12 colleagues on the NAT exhaust the minute. What the user needed: normal use by one office. Evidence: concurrency log (quoted above); `screenshots/x-login-rate-limit.png` shows the login variant.

**F-02 · Login limit 10/min per IP counts successful logins** — Large · S15, S17 · everyone.
Steps: 10 colleagues sign in within a minute (or `curl` login ×10); the 11th person signs in with the right password.
What happened: "Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу." with no indication of how long (API says `retry-after: 51`). At 9:00 on Monday with 120 people this is an outage. Needed: throttle failed attempts, not logins. `screenshots/x-login-rate-limit.png`.

**F-03 · Deleting a task promises a restore that doesn't exist** — Both · S8 · any member.
Steps: List row → "нэмэлт үйлдэл" → "Устгах" → confirm "«…» ажлыг устгах уу? Дараа нь сэргээх боломжтой." → OK.
What happened: no undo toast; ⌘K search "NMD-137" → "Илэрц олдсонгүй"; the task page `/t/NMD-137` (from browser history) opens fully editable with no "deleted" banner, its activity feed is empty (console: `/activity` 404 ×4) and its menu offers "Хуулбарлах / Төсөл сонгох… / Устгах" again. Needed: an undo toast and a trash/restore, or an honest confirm. `screenshots/s08-after-delete.png`, `s08-search-deleted.png`, `s08-deleted-task-page.png`, `s08-deleted-task-menu.png`.

### Major

**F-04 · A typed "@Name" that isn't picked from the popup is silently plain text** — Both · S6 · designer.
Steps: in a comment type `@Тэмүүжин харж өгөөч` quickly, keep typing past the suggestion, ⌘↵.
What happened: saved as plain text (`<p>… @Тэмүүжин харж өгөөч</p>`, no mention chip), no notification to Тэмүүжин; the author sees the same "@Тэмүүжин" and believes they were pinged. Needed: resolve an exact-name @ on send, or render unresolved "@" visibly differently. `screenshots/s06-plain-text-mention.png`, `s06-dev-mentions-tab.png` (the mention is absent).

**F-05 · No multi-select or bulk edit anywhere** — Both · S2, S3, S14 · lead, anyone handing over.
Steps: move 21 unfinished tasks to the next sprint; reassign 14 tasks before a holiday.
What happened: each task = open drawer → Спринт → pick → close (4 clicks), or open → Хариуцагч нэмэх → pick → deselect self → Esc → close (6 clicks). The row menu has only Нээх / Дууссан гэж тэмдэглэх / Холбоос хуулах / Устгах. Needed: select rows, change sprint/assignee/status/due once. `screenshots/s02-row-menu.png`, `s02-sprint-picker.png`, `s03-reassigned.png`.

**F-06 · No follow/unfollow, mute or per-project notification control** — Large (Both) · S5, S14 · PMO, creator.
Steps: open any task drawer and look for a way to follow or stop following; open Inbox as Номин Ганзориг.
What happened: the drawer has no followers list or follow toggle; Settings → Мэдэгдэл is global by type only. The PMO got 385 notifications in one day (267 "commented"), 644 unread; the only relief is "Бүгдийг уншсан болгох". Needed: watchers control, mute task/project, inbox filter by project. `screenshots/s05-task-menu.png`, `s14-pmo-inbox.png`.

**F-07 · Project views load and render every task ever, including Done** — Large · S16, X1 · support lead.
Steps: open HELP (2,993 tasks, 2,564 done) → List → Board; repeat on Fast 3G.
What happened: `/projects/:id/tasks` = 2.86 MB (14.8 s on 3G; List visible after 21 s); Board draws 2,993 cards, Done column 2,564 cards, 5.4 s on LAN. The same happens on NMD once the default sprint filter is removed (Done 90). Needed: fetch open tasks first, page or collapse Done. `screenshots/s16-help-board.png`, `s16-help-list.png`, `x-3g-drawer.png`.

**F-08 · Search caps at 20 results, has no filters and ignores comments** — Large · S11 · anyone.
Steps: ⌘K "idempotency" (176 matching tasks); ⌘K "Root cause" (a comment text).
What happened: 20 results, no "more", no date/project/status, so the three-month-old task cannot be reached; comments return "Илэрц олдсонгүй". Needed: paging and filters, or a search page; index comments. `screenshots/s11-search-after.png`.

**F-09 · Name search is script-literal; short names collide** — Large · S10 · EM assigning.
Steps: assignee picker → type "Bat"; type "Бат-Эрдэнэ".
What happened: "Bat" → 4 Latin names only (Bat-Erdene Tsogt, …), "Бат-Эрдэнэ" → the two Cyrillic ones; nobody sees all three at once. In List/Board the cell shows "Бат-Эрдэнэ Г." for both Ганболд and Гантулга. Needed: transliterated matching; disambiguate short names when they collide. `screenshots/s10-assignee-bat.png`.

**F-10 · Nothing tells a new hire which of 55 projects are theirs** — Large · S9 · new hire.
Steps: sign in as Мишээл, expand the sidebar.
What happened: 10 spaces → 55 projects, 2,539 px, no marker, no favourites section (she has none), no "my projects"; she belongs to 7, including 2 archived ones she will never see. Needed: "Миний төслүүд" or membership marks; favourites in the sidebar. `screenshots/s09-sidebar-all-expanded.png`.

**F-11 · Mark-done from My Tasks is instant, undo-less and the task disappears** — Both · S8 · anyone.
Steps: on My Tasks click the checkbox of the wrong row.
What happened: row vanishes, overdue count drops, no toast, no Done section, own actions don't appear in "Сүүлийн үйл ажиллагаа". Recovery: ⌘K → 7 identical "Аймгуудын жагсаалтыг…" results with no status/assignee → open → header "Дуусаагүй болгох" (which does restore the previous status). Needed: undo toast; status in search results. `screenshots/s08-accidental-done.png`, `s08-search-recover.png`, `s08-undone.png`.

**F-12 · No offboarding path** — Large · S15 · admin.
Steps: Settings → Гишүүд, find a leaver, try to remove or reassign.
What happened: 120 rows, 240 inline inputs (title, capacity), no search, controls = role picker only. No remove/deactivate, no list of the person's open tasks, no bulk reassign; leavers keep open tasks (Мандах Х. 55), lead roles (KYC) and reviewer roles. Needed: remove/deactivate with "reassign N open tasks to…". `screenshots/s15-members.png`.

**F-13 · Workload says everyone is "Ачаалал их"; availability is invisible** — Both · S1, S12, S5 · lead, department head.
Steps: Reports → Ачаалал; scope to "Борлуулалт ба түншлэл"; open any assignee picker.
What happened: 120/120 and 15/15 rows are red (capacity 15 points per 2 weeks vs all open points, 26–209); the person on vacation (Оюунаа) is "Ачаалал их" like everyone else and the bug in S5 was assigned to her. Needed: load relative to due-soon work, an away state shown in Workload and pickers. `screenshots/s12-workload-sales.png`, `s01-workload.png`, `s05-assignee-picker.png`.

**F-14 · A transient API failure kills the page until manual reload** — Both · X2 · anyone.
Steps: with the API unreachable, click "Миний ажлууд"; bring the API back.
What happened: full-page "Алдаа гарлаа — Гэнэтийн алдааны улмаас хуудас зогслоо. Дахин ачаалж үзнэ үү." with a reload button; it does not recover on its own. (In-place actions are handled well: status change rolls back with a toast, comment draft is kept.) `screenshots/x-api-down-navigate.png`, `x-api-down-status.png`.

**F-15 · "What did each person finish" exists only as counts and CSV** — Small · S1, S7 · lead, member.
Steps: Reports → Хүмүүс → pick a person → Custom period (type `2026-10-05` / `2026-10-11`); My Tasks stat "Энэ долоо хоногт дууссан".
What happened: cards show "Дууссан 4", trends and open tasks — never the four tasks; My Tasks stat is a non-clickable number; 7 people = 7 picker visits. Needed: completed-task list per period, "last week" preset. `screenshots/s01-people.png`, `s01-custom-period.png`, `s07-my-performance.png`.

**F-16 · Keyboard: no skip link, drawer not trapped, status listbox opens on the wrong item** — Both · X4 · keyboard user.
Steps: fresh session, My Tasks, press Tab until a task; Enter; Tab ×41; Esc; in the drawer focus "Төлөв", Enter, ↓, Enter.
What happened: 45 Tabs to the first task (sidebar first); Tab walks out of the open drawer into the page behind; after Esc focus lands on `body`; the status listbox highlights the first option rather than the current one, so ↓ ↵ set "Хийгдэж буй" on a task that was "Хянагдаж буй" (↑ ↵ gave "Дууссан"). Needed: skip link, focus trap + restore, listbox opens on the current value. `screenshots/s09-sidebar-all-expanded.png`.

### Minor

**F-17 · Default sprint filter hides work without saying so clearly** — Both · S4, S6. NMD opens with "Спринт: 10-р сарын 12 – 23": the board shows 3 of 7 In-Review tasks, the new joiner sees 27 of 139; the chip is small and the count reads "27 ажил" as if that were the project. `s06-board.png`, `s04-project-page.png`.

**F-18 · List rows don't show the task key** — Both · S2, S8. Two rows titled "Аялалын маршрут хуваалцах функцийн эхний хувилбар" (NMD-86, NMD-111) are indistinguishable; the key is only in the drawer and the URL. `s02-project-list.png`.

**F-19 · Native `confirm()` for delete** — Both · S8. Browser dialog, not styled, blocks the tab, and (F-03) makes a promise the app doesn't keep. `s08-after-delete.png`.

**F-20 · "Reassign" is really "add assignee"** — Both · S2, S3. Picking a second person keeps the first; a lead who forgets the deselect leaves two assignees (and both get notified). `s02-assignee-picker.png`.

**F-21 · Quick create: silent default project, hidden priority, no sprint** — Both · S5. The modal pre-selects the last visited project without asking; priority/size/status/tags sit behind "Бусад талбар"; the new urgent bug lands outside the current sprint ("Спринтгүй"). `s05-quick-create.png`, `s05-other-fields.png`, `s05-created.png`.

**F-22 · Projects have no description, goals or README** — Both · S4. A new joiner can only infer the project from its task list and the avatar stack. `s04-project-page.png`.

**F-23 · Project name in My Tasks rows is not a link** — Both · S4. Clicking "Nomad апп 2.0" in a row does nothing; the user goes to the sidebar. `s04-newjoiner-mytasks.png`.

**F-24 · Sidebar expansion state leaks between accounts on one browser** — Both · S4. Saruul's first click on "Бүтээгдэхүүн" collapsed it, because Номин had left it expanded. `s04-sidebar-state.png`.

**F-25 · Sprint report "Шилжиж ирсэн 0" after a replan** — Both · S2, S19. Sprint 7 finished 14 of 37, sprint 8 was planned on its last afternoon, and the card says 0 carried over; readers will distrust the whole page. `s02-sprints-report.png`, `s19-sprints.png`.

**F-26 · Esc on the drawer pushes history** — Both · X3. Back after closing a drawer reopens it instead of going to the previous screen. `s02-task-drawer.png`.

**F-27 · My Tasks stat cards aren't actionable** — Both · S7. "Энэ долоо хоногт дууссан 6" and "Хугацаа хэтэрсэн 23" can't be clicked. `s07-dev-mytasks.png`.

**F-28 · Throughput "Өмнөх үе" line is all zeros for a young team** — Small · S1. Twelve weeks of 0 drawn as a series, then "3" in the last week; it reads like a bug. `s01-reports-overview.png`.

**F-29 · Members can create spaces/projects but can't archive them** — Large · S18. A member's mistaken project (201 on create) can't be undone by them (403 on archive, 400 on space delete while it has a project); admins must clean up. `s18-member-settings.png`.

**F-30 · Tag picker has no inline create** — Large · S20. Typing a new tag name shows an empty list; 305 flat alphabetical options otherwise work. `s20-tag-picker.png`.

**F-31 · Concurrent edits are last-write-wins without any signal** — Large · S17 (3-user run). Three people set three titles and three priorities within a second; everyone converged on the last one in ~2 s with no "edited by X just now" and no conflict notice. No screenshot (script).

**F-32 · Search results show no status, assignee or date** — Both · S8, S11. Seven identical titles, nothing to tell the done one from the open ones. `s08-search-recover.png`.

## Breaks at scale (works for 7, fails for 120)

- **Shared-IP rate limits** (F-01, F-02): invisible at 7 desks, an outage at 120 behind one NAT.
- **Notification volume** (F-06): 49 unread for the Nomad lead is annoying; 644 unread and 385/day for the PMO is unusable without unfollow/mute/project filters.
- **Payload size** (F-07): NMD's 139 tasks are nothing; HELP's 2,993 tasks are 2.9 MB per List open and a 3,000-card board.
- **Sidebar and pickers** (F-10, S20): 4 projects fit; 55 projects become a 2.5 k px tree with no "mine"; 120-person pickers work only because they have search, and that search doesn't cross scripts (F-09).
- **Duplicate names** (F-09): "Бат-Эрдэнэ Г." is unique at Nomad Labs and two people at Altai; list cells, Workload rows and activity lines all use the short form.
- **Workload semantics** (F-13): with everyone over the flat 15-point capacity the colour carries no information; "heavy" is 120/120.
- **Search** (F-08): 20 results is the whole workspace at Nomad; at Altai it is the first 11% of one query.
- **Settings → Members** (F-12): 7 rows are fine; 120 rows with 240 inputs, no search and no remove is not an admin tool.
- **My Tasks** (F-27): 17 rows read at a glance; the PMO's 97 rows across 5,021 px do not.
- **Permissions** hold at both sizes: 403/404 are right, foreign workspaces return 404, admin-only UI is hidden. What's missing is organisational, not access control: no department/team grouping, so Workload, Members and People reports are flat lists of 120.

## Missing for real work

Only features the scenarios actually ran into.

| Missing | Exposed by | How much it hurt |
|---|---|---|
| Bulk edit / multi-select (sprint, assignee, status, due) | S2, S3, S14 | 84 clicks for a handover; sprint planning done elsewhere. |
| Trash / restore for tasks | S8 | A deleted task is gone from the UI although the confirm says otherwise. |
| Watchers control: follow/unfollow, mute task or project, inbox filters | S5, S6, S14 | Can't follow a bug you reported but aren't assigned to; PMO drowns. |
| Out-of-office / availability | S1, S3, S5, S12 | Work assigned to someone on leave; Workload can't tell busy from absent. |
| Undo (toast) on one-click actions | S8, S2 | Mark-done, sprint move and delete are immediate and silent. |
| Member offboarding (remove/deactivate + reassign) | S15 | Not possible at all; leavers keep tasks, lead and reviewer roles. |
| "My projects" / membership in the sidebar, favourites section | S9, S4 | New hire can't find their 7 projects among 55. |
| Completed-task lists per person/period ("done last week") and a "last week" preset | S1, S7 | Standup and Friday wrap-up need a side document; CSV is the only list. |
| Search depth: paging, filters, comment search, status in results | S11, S8 | Old tasks and comments are unfindable; duplicates indistinguishable. |
| Task relations (link, blocks, parent) and "created by me" | S13 | Cross-team request can't be tied to the engineering task; requester can't see their own requests. |
| Project description / brief | S4 | New joiner has no context beyond task titles. |
| Transliterated name search | S10 | Latin and Cyrillic colleagues live in separate search worlds. |
| Team/department grouping for Workload, Members, People | S12, S15 | Head of sales scrolls 120 rows or scopes to one space at a time. |
| Presence/conflict hints on shared edits ("X is editing") | S17 | Silent last-write-wins on title and priority. |

## Test-data changes made during the run

So the next tester isn't surprised: NMD sprint 9 created; NMD-86 moved to sprint 9; NMD-137 reassigned to Saruul and then deleted (unrecoverable from UI); NMD-9 marked done, undone and reassigned to Номин; NMD-140 created (urgent, assigned to Оюунаа); comments added on NMD-126, NMD-106, NMD-125, NMD-57 (+ reply), NMD-73, NMD-92; WEBP-682 title/priority changed by the concurrency script and 13 comments added; WEBP-687/691 touched by drags; PAPI-638 status changed by keyboard and restored to "Хянагдаж буй"; a member-created space "Туршилт (member)" and project were removed in the database. Login attempts from this machine triggered the per-IP throttle several times.
