# Reports — build prompts for Claude Code

Run these after Phase 16 and before Phase 17. Same workflow: plan mode (Shift+Tab) at the start of each phase, commit and `/clear` after each.

Before R0, copy the files from this kit's `design/` folder into your repo's `design/` folder. `TaskDetail.dc.html` replaces the old one (it now has the Size property).

| Design file | Screen |
|---|---|
| `design/Reports.dc.html` | Overview |
| `design/ReportsDark.dc.html` | Overview, dark mode |
| `design/ReportsSprints.dc.html` | Sprints |
| `design/ReportsWorkload.dc.html` | Workload (admins) |
| `design/ReportsPeople.dc.html` | People (admins) |
| `design/ReportsMine.dc.html` | My performance (members) |
| `design/ReportsEmpty.dc.html` | Not enough history yet |
| `design/ReportsLoading.dc.html` | Loading skeleton |
| `design/TaskDetail.dc.html` | Task drawer, now with Size (S / M / L / XL) |

---

## R0 — Read and plan (no code)

```
We're adding a Reports section. Don't write code yet.

Read CLAUDE.md, docs/design-notes.md, and these design files: Reports.dc.html, ReportsDark.dc.html, ReportsSprints.dc.html, ReportsWorkload.dc.html, ReportsPeople.dc.html, ReportsMine.dc.html, ReportsEmpty.dc.html, ReportsLoading.dc.html, and the updated TaskDetail.dc.html (it now has a Size property). As before, read them as source: inline styles for visuals, the data-dc-script block for sample data, mn/en strings and logic.

Then give me:
1. A summary of each Reports screen, its states, and the data it needs. Include the details that are easy to miss: the insight sentence under the throughput chart, the "This week is still in progress" partial-week marker, "Updated 5 minutes ago", the "Stale" flag, the capacity marker and Heavy/Balanced/Light rule on Workload, job titles under names, sprint numbering and working days, the projected line and "Replan" on the burndown, "Team median" comparisons, "Worked with most", mentions answered with median reply time, the "x / 5" progress on the empty state, and the visibility notes ("Visible to admins only", "Visible only to you and workspace admins").
2. The schema changes required and how you'll backfill history from the existing activity table.
3. The report endpoints with query params and response shapes.
4. Components to reuse and new ones needed.
5. Anything in the designs that conflicts with CLAUDE.md, and questions for me.

Add a Reports section to docs/design-notes.md, and a Reports section to CLAUDE.md with the data model additions, metric definitions (from R2 below once agreed), and the permissions rule.
```

## R1 — Data foundation

```
Implement the data needed for reports.

Schema (Drizzle + migration):
- tasks.size: enum S/M/L/XL, nullable, shown as story points. Weights S=1, M=2, L=3, XL=5, defined once in packages/shared.
- tasks.reviewer_id: nullable FK to users. projects.lead_id if it doesn't exist yet.
- workspace_members.title (job title, e.g. "Engineering lead", "Product designer", shown under names on Workload and People) and workspace_members.capacity_points (default 15, meaning points per person for the next 2 weeks). Admins can edit both in Settings → Members.
- sprints.number (sequential per project, shown as "Sprint 14"); sprints keep start_date/end_date.
- task_status_history: id, task_id, from_status_id (null on creation), to_status_id, actor_id, changed_at. Indexes (task_id, changed_at) and (to_status_id, changed_at).
- sprint_scope: sprint_id, task_id, added_at, committed (true if present at sprint start), removed_at nullable.
- workspace_holidays: workspace_id, date, name (so working-day counts can skip Mongolian public holidays; seed the 2026 ones and let admins edit later).

Write paths:
- Route every status change (PATCH, move, complete toggle, board/list/calendar drags, templates, bulk actions) through one function that writes task_status_history in the same transaction. Add a test that fails if any path changes status_id without a history row.
- Task creation writes the initial history row.
- Entering a "review" status sets reviewer_id if empty: the person picked in the UI, otherwise the project lead.
- Adding/removing tasks from a sprint maintains sprint_scope.

Backfill migration: rebuild task_status_history from existing status.changed and task.created activity rows; tasks with no history get one row at created_at with their current status. Idempotent.

UI (small, match the updated design/TaskDetail.dc.html exactly): the Size segmented control (S / M / L / XL) in the drawer properties; Size in quick-create "More fields"; an optional Size column in the List view; Reviewer shown in the drawer while the task is in review. Job title and capacity fields in Settings → Members (admins only).

Realtime: include size and reviewer in the existing task.updated events.

Seed: about 12 weeks of realistic history for App Redesign and 2–3 other projects, matching the numbers in the design files as closely as practical: tasks moving through statuses at varied speeds, In Review clearly the slowest stage, some overdue tasks (one ~6 days late), sizes on most tasks, sprints numbered up to Sprint 14 (current, day 4 of 15 working days) with mid-sprint additions and carry-overs, reviewers on reviewed tasks, comments and @mentions on others' tasks with replies, job titles and capacity for all 7 people. Partner Portal stays nearly empty (1 completed task) so it shows the "not enough history" state. Dates relative to today.

Done when pnpm db:reset works and a quick script prints median days per status for App Redesign.
```

## R2 — Reports API

```
Build the reports API under /api/v1/reports. Compute metrics in SQL (CTEs, window functions, percentile_cont), not by loading rows into JS.

Shared query params (zod, in packages/shared): workspaceId, spaceId?, projectId?, sprintId?, period (this_week | last_4_weeks | this_quarter | custom), from?, to?, userId?. Periods use the user's timezone (default Asia/Ulaanbaatar), weeks start Monday. Every metric that shows a delta also returns the previous equal-length period, plus the human-readable ranges the header shows ("Sep 12 – Oct 9 · compared with the previous 4 weeks (Aug 15 – Sep 11)").

Metric definitions (add to CLAUDE.md):
- Completed: tasks whose last transition into done happened in the period (task_status_history). Count and points.
- Throughput: completed count per week for 12 weeks; flag the current week as partial ("This week is still in progress"). Also return an insight sentence input: average per week in the first half vs second half of the range, so the UI can say "Tasks completed per week rose from X to Y".
- Cycle time: first entry into in_progress → last entry into done, in days with one decimal; median and p85. Lower is better.
- Time in status ("Where work waits"): median days spent in each status category, for tasks completed in the period.
- On-time delivery: completed with a due date and completed on or before it ÷ completed with a due date.
- Overdue now: open tasks with due_date < today, plus the oldest one's days late.
- Aging / Stale: open tasks with days in current status; stale when > 5 days (constant in shared, per status category, matching the design's note).
- Review turnaround: median time from entering review to leaving it, by reviewer_id.
- Mentions answered: mentions of the person in comments that they replied to on the same task afterwards; plus median reply time.
- Helping others: comments and completed subtasks on tasks where the person isn't an assignee; "Worked with most": the people they most often share tasks or comment threads with.
- Team median: for each person metric, the median across active workspace members in the same period.
- Sprint: number, committed (at start), completed of committed, scope added mid-sprint, carried over into the next sprint, times carried per task. Working days exclude weekends and workspace_holidays. Burndown: remaining tasks per working day, ideal line, and a projected line from the current daily completion rate to the end date.
- Workload: per person open count and open points split into overdue / due this week / later / no due date; capacity from capacity_points; chip rule exactly as in ReportsWorkload.dc.html: Heavy if open points > capacity + 3 or overdue tasks ≥ 5, Light if open points ≤ 7, otherwise Balanced.
- Empty state: a project has "enough history" after 5 completed tasks; return completedSoFar so the UI shows "1 / 5".

Endpoints:
- GET /reports/overview, /reports/sprints, /reports/workload, /reports/people/:userId, /reports/me.
- Each response includes computedAt. Cache results per (report, params, user role) for 5 minutes in memory; invalidate the cache for a workspace when task events arrive (debounced). The UI shows "Updated N minutes ago".
- CSV: /reports/aging.csv, /reports/workload.csv, /reports/sprints/carried.csv, /reports/people/:userId/completed.csv, and /reports/me/export.csv ("Export my data"). Headers in the user's locale (mn/en).

Permissions (enforced in the API):
- Any member: overview, sprints, and /reports/me.
- Admins/owners only: workload and /reports/people/:userId for anyone. Members get 403.
- Everything scoped to projects the caller can access.

Performance: indexes for these queries; generate 10k tasks with history in a test script and confirm each endpoint is under 300ms uncached. Show me EXPLAIN for the slowest.

Tests with fixed fixtures and a frozen clock: cycle time with reopen, on-time edge cases (due today, no due date), Monday week boundaries in Asia/Ulaanbaatar, working days with a holiday, sprint committed vs added vs carried, the Heavy/Balanced/Light rule boundaries, mentions answered, permissions (member → workload 403, member → own report 200).
```

## R3 — Reports UI foundation + Overview

```
Build the Reports frontend foundation and the Overview tab. Match design/Reports.dc.html, ReportsDark.dc.html, ReportsEmpty.dc.html and ReportsLoading.dc.html closely, in mn and en.

- Sidebar "Reports" item exactly as in the designs. Routes: /reports/overview, /reports/sprints, /reports/workload, /reports/people/:userId?, /reports/me. Members see "My performance" instead of People and have no Workload tab; redirect if they open those URLs.
- Page header as designed: title, tabs, Period / Space / Project filters (filters in the URL), "Updated N minutes ago" from computedAt, Export CSV.
- Chart components wrapping Recharts (or plain SVG if that matches the design better; check how the design draws them): LineTrend with previous-period line and partial-week marker, BarByCategory, StackedBar, Sparkline, Burndown. Colors from CSS variables so light/dark and the user's accent work. Tooltips styled like the design ("Week of …").
- StatCard with value, unit, delta "vs previous period", and "lower is better" handling so a falling cycle time shows as an improvement.
- Overview: the 4 stat cards (Completed, Median cycle time, On-time delivery, Overdue with "Oldest is N days late"), throughput chart with the insight sentence, "Where work waits", Aging tasks table with the Stale flag and "View all"; rows open the task drawer.
- Empty state ("Reports appear after your team completes a few tasks", "x / 5" progress, preview of what you'll see, links) and the loading skeleton exactly as designed.
- Realtime: on task events over the WebSocket, invalidate report queries, debounced to at most once every 10 seconds.
- All strings in mn.json / en.json; take Mongolian copy from the design files' STR tables.
```

## R4 — Sprints and Workload

```
Build the Sprints and Workload tabs. Match design/ReportsSprints.dc.html and design/ReportsWorkload.dc.html closely.

Sprints:
- Sprint selector, summary cards (Committed "incl. N carried over", Completed, Scope added, Carried to next sprint), the "Committed vs completed · last 6 sprints" chart with scope-added segments, the current sprint burndown with Remaining / Ideal / Projected lines, today marker, and the "Day 4 of 15 working days · 11 days left" line.
- "Replan" button: opens the sprint's task list filtered to open tasks so the user can move tasks out of the sprint (reuse the existing List view with a sprint filter; no new editing UI).
- "Carried over from last sprint" table with Times carried; rows open the drawer. CSV export.

Workload (admins only):
- Rows with avatar, name, job title, open tasks, open points, stacked bar (Overdue / Due this week / Later / No due date) on one shared scale with the capacity marker, and the Heavy / Balanced / Light chip using the rule from R2. Footnote text from the design.
- Sort by options as designed. No ranks or leaderboard styling.
- Click a row to expand that person's open tasks; each task opens the drawer, and "Assign work" opens the assignee picker so admins can rebalance right there. Bars update optimistically after reassignment.
- CSV export.
```

## R5 — People, My performance, polish

```
Build People (admins) and My performance (members). Match design/ReportsPeople.dc.html and design/ReportsMine.dc.html closely.

People:
- "Choose a person" picker, "Visible to admins only" note, the 1:1 note ("Use these as a starting point for 1:1 conversations, not as a score.").
- Stat cards vs previous period and vs Team median: Completed, On-time, Median cycle time, Overdue now (or "No overdue tasks"), Review turnaround "as reviewer" (or "No reviews this period").
- Completed per week and Cycle time charts over the last 12 weeks with the team median line.
- Helping others: comments on others' tasks, subtasks done on others' tasks, mentions answered with median reply time, Worked with most.
- Current open tasks styled like My Tasks rows; "See workload" link.

My performance:
- Same building blocks for the current user with the friendlier copy from the design: period-dependent title ("Your week so far" / "Your last 4 weeks" / "Your quarter so far" / "Your chosen period"), "Visible only to you and workspace admins", "How you helped others", "People you worked with most", "Your open tasks", "Go to My Tasks", "Export my data".
- Neutral tone: no overall good/bad coloring of a person; only specific items like overdue tasks get warning colors.

Polish pass across all Reports screens:
- Compare each screen with its design file in mn and en, light and dark (ReportsDark.dc.html for the dark palette). Check long Mongolian labels in stat cards, tabs, chips, and chart axes don't overflow.
- Keyboard access for tabs, filters, pickers, table rows; each chart gets an accessible summary (aria-label or a visually hidden table).
- Playwright: admin opens Workload, expands a Heavy person, reassigns a task, sees both bars update; member opens /reports/workload and is redirected to /reports/me; empty state shows on Partner Portal.
- Update README and CLAUDE.md with the Reports section.
```

After R5, continue with Phase 17 and add this line to that prompt: "Include the Reports endpoints and screens in every check below."
