---
paths:
  - 'apps/api/src/reports/**'
  - 'apps/api/test/reports*'
  - 'apps/api/src/db/seed/**'
  - 'apps/api/src/scripts/**'
  - 'apps/web/src/features/reports/**'
  - 'apps/web/src/api/reports.ts'
  - 'apps/web/src/test/reports.ts'
  - 'apps/web/e2e/reports.spec.ts'
  - 'packages/shared/src/reports.ts'
  - 'packages/shared/src/schemas/reports.ts'
  - 'design/Reports*.dc.html'
---

## Reports

Tabs: Overview, Sprints, Workload, plus People (admins/owner) or My performance (members). Screen notes: `docs/design-notes.md` §1.10–1.18.

**API**: `GET /api/v1/workspaces/:workspaceId/reports/overview | sprints | workload | people/:userId` (`me` alias), plus a `.csv` variant of each (UTF-8 with BOM, headers in the caller's locale). OpenAPI tag "Reports"; response schemas live in `packages/shared/src/schemas/reports.ts`, constants and the pure rules (`reportRange`, `workloadLoad`, `sprintPace`, `STALE_DAYS`, …) in `packages/shared/src/reports.ts`. Code: `apps/api/src/reports/` (one module per report, each exporting its SQL query builders).

- **CSV contents**: `overview.csv` = every open task with days in status (the Aging table, unabridged); `sprints.csv` = the selected sprint's tasks with committed / added / done / times carried / Replan; `workload.csv` = one row per person (points per bucket, capacity, load); `people/:userId.csv` = the person's completed tasks in the period with cycle times ("Export my data" for `me`).
- **Query params**: `period=week|lastWeek|4w|lastMonth|quarter|custom` (default `4w`), `from`/`to` (dates, custom only, ≤ 366 days), `spaceId?`, `projectId?`. Overview also takes `agingLimit?` (1–500 or `all`, default 20: the Aging rows; "View all" sends `all`). Sprints takes `spaceId?`, `projectId?` and `sprintId?` (default: the current sprint in scope, latest start first, else the latest started, else the newest); it lists the sprints covering a non-archived project in scope and counts only tasks of those projects (`project` = the `projectId` filter or null); a `sprintId` covering no project in scope is 404. `sprints.csv` takes the same params. The current sprint also returns `waitingMost` (the wait category its open tasks have waited longest in, by median days in their current status) for the burndown insight. Workload tasks carry their `assignees` (the reassign picker).
- **Response metadata**: every response has `generatedAt` and `scope`; period reports also return `range` and `previousRange`.
- **Computation**: reports are computed live in SQL (CTEs, `FILTER`, `percentile_cont`); no snapshot tables. Each API process caches a computed report for 5 min (`REPORTS_CACHE_TTL_MS`, 0 = off; `apps/api/src/reports/cache.ts`), keyed by report + query + the caller's time zone and today (+ the person); permissions are checked before the lookup. Any task event on the bus drops that workspace's entries, as do a member title/capacity change and any sprint change (create, edit, delete). "Updated N minutes ago" = `generatedAt` (when it was computed). The web refetches every 5 min and on focus. Query keys sit under `['tasks', 'reports', …]` so task writes invalidate them; teammates' task events over the WebSocket refresh them throttled to once per 10 s (`REPORTS_THROTTLE_MS`, `apps/web/src/realtime/applyMessage.ts`).
- **Performance**: `pnpm db:perf` builds a 10k-task "Perf" workspace in the dev database (`--fresh` rebuilds, `--drop` removes it; tags, subtasks and attachments are added once), times every report endpoint uncached (target < 300 ms) and prints EXPLAIN ANALYZE for the slowest query; it then times the task list endpoints (project/space List, My Tasks) and EXPLAINs each list query variant (`projectTaskListQuery`/`spaceTaskListQuery` in `apps/api/src/tasks/list.ts`). The plans use `tasks_project_id_number_unique` for the project filter and the per-task PK/FK indexes for every aggregate, so no extra index was needed; the cost is linear in rows (the correlated aggregates). The R1 indexes cover the plans (`tasks_completed_at_idx`, `task_status_periods (task_id, entered_at)` / `(category, exited_at)`, `activity (task_id, created_at)` / `(workspace_id, type, created_at)`, `comments (author_id, created_at)`).
- **Text**: sentences (insights, deltas, pace) are built on the client from numbers.
- **Web**: `apps/web/src/features/reports/`, one folder per tab (`overview/`, `sprints/`, `workload/`, `people/`; People and My performance are one `PersonTab` with `variant: 'people' | 'me'`, wording that differs lives under `reports.person.people|mine`). Charts are hand-drawn SVG in `charts/` (no chart library); every figure has an `aria-label` summary sentence and a visually hidden data table (`ChartFrame`'s `table`, `ChartDataTable`). Hooks: `src/api/reports.ts` (`usePersonReport(ws, userId | 'me', filters)`).

**Permissions**:

- Every report requires workspace membership; non-members get 404.
- Overview, Sprints and Workload are open to every member.
- `people/:userId` (and its CSV) requires admin/owner unless `userId` is the caller. A member asking for someone else gets 403 `FORBIDDEN`; a user who isn't a member of the workspace gets 404.
- The web shows the People tab only to admins/owner (picker defaults to self). Members get My performance, labelled "Visible only to you and workspace admins"; People is labelled "Visible to admins only".

**Scope and periods** (all dates in the caller's timezone):

- **Scope**: workspace, a space, or a project. Only non-deleted tasks of non-archived projects count.
- **Periods**:
  - `4w` = the 28 days ending today.
  - `week` = Monday → today.
  - `lastWeek` = the previous Monday → Sunday.
  - `lastMonth` = the previous calendar month.
  - `quarter` = the calendar quarter up to today.
  - `custom` = `from`–`to`.
- **Previous period**: the same-length window immediately before; for `lastMonth`, the calendar month before it.
- **Empty state**: shown when the scope has fewer than **5** completed tasks (all time). The page then shows "x / 5" progress.

**Metric definitions**:

- **Completed**: tasks whose `completed_at` falls in the period. **Points** = sum of `SIZE_POINTS[size]` (S 1 · M 3 · L 5 · XL 8). Unsized tasks count 0 points and are reported as "N unsized".
- **Cycle time**: `completed_at` − `entered_at` of the task's first `in_progress` or `review` period. If neither exists, use `created_at`. Report the median and the 85th percentile, in days to 1 decimal.
- **On-time delivery**: among completed tasks that have a due date, the share with completion date (local) ≤ `due_date`. Shown as "% · N of M". Delta in percentage points ("4 pp"; "pts" means story points).
- **Open** everywhere below means `closed_at` is null: not done and not cancelled. On hold is open. Cancelled tasks never count as completed (`completed_at` is set by done only).
- **Overdue**: open tasks with `due_date` < today. A snapshot that ignores the period. "Oldest is N days late" = max(today − due).
- **Throughput**: tasks completed per Monday–Sunday week over the last 12 weeks, regardless of the period. The web labels the series "Last 12 weeks" / "12 weeks before" and tints the weeks that overlap the selected period.
  - Previous series = the 12 weeks before; omitted (empty array, one legend line) when nothing was completed in them.
  - The current week is flagged `partial`: hollow point, with the tooltip "This week is still in progress".
- **Where work waits**: per category (To Do, In Progress, In Review: `WAIT_CATEGORIES`; On hold is parked on purpose and left out), the median length in days of status periods that ended within the period.
  - The insight names the slowest category and its ratio to the next slowest.
- **Days in status / Aging**: today − `entered_at` of the open status period. Open tasks in a wait category only (not On hold), sorted descending. **Stale** when > 5 days (`STALE_DAYS`, per category, all 5). Overview returns the top 20 plus totals.
- **Sprints** (shared by projects: a sprint covers the projects in `sprint_projects`; every number below counts only tasks of the projects in scope):
  - **Working days**: Mon–Fri between `start_date` and `end_date`, minus `workspace_holidays`. "Day N of M working days · K days left".
  - **Committed**: memberships open at sprint start (start date 00:00).
  - **Added mid-sprint**: memberships added after the start. Scope = committed + added.
  - **Completed**: members done by min(end, today).
  - **Burndown**: open members at the end of each working day (a cancelled task leaves it like a done one; `closedAt` in `reports/sql.ts`).
    - Ideal = committed → 0, linear over the working days.
    - Projected = linear from today at (remaining at start − remaining today) / days elapsed.
    - Scope-added chips show the tasks added per day.
  - **Pace**: "slightly behind ideal" when remaining > ideal by at most 15 % of committed; "behind" beyond that; on track otherwise.
  - **Related sprints**: the sprints sharing a project in scope with the selected one, by start date then number. Recent (the chart's last 6), previous (N−1) and next come from this list.
  - **Carried over**: tasks in sprint N's scope (committed or added) that were in the previous related sprint N−1 during it and left it unfinished: not closed (done or cancelled) at the moment their N−1 membership ended, or at N−1's end if it was still open then. Memberships of N−1 that ended before N−1 started don't count. (A replan on the last afternoon or after sprint N started counts; `setSprint` closes and opens memberships at the same instant.)
    - **Times carried** = the number of earlier related sprints the task left unfinished the same way (each sprint once).
    - **Replan** when ≥ 3.
    - For a past sprint, the card shows "Carried to next sprint" instead: its scope's tasks that left it unfinished and are (or were) in sprint N+1.
- **Workload**: a snapshot of open tasks per assignee (a task with several assignees counts fully for each). Lists workspace members, or with a scope filter the scoped projects' members plus anyone with open tasks there.
  - **Buckets** by due date:
    - Overdue (< today)
    - Due this week (today → Sunday)
    - Later
    - No due date
  - **Load points** (`loadPoints`; a task's `counted`): points of open tasks due within `LOAD_WINDOW_DAYS` (14: due ≤ today + 13, overdue included) **or** in a sprint running today. Later and undated work outside a current sprint still shows in the bar, as one dashed-outline segment "Not due soon" after the counted buckets, but doesn't count against capacity (decided 2026-10-13, usability review F-13: with all open points everyone was Heavy).
  - **Load**:
    - **Heavy** if load points > capacity × 1.2 **or** overdue points ≥ 5.
    - **Light** if load points ≤ capacity / 2.
    - **Balanced** otherwise.
    - Capacity C is the person's `workspace_members.capacity_points` (default 15): Heavy means > 18 and Light ≤ 7.5, i.e. the designed > 18 / ≤ 7. The capacity marker is drawn per row; "N pts over capacity / of room" in the expanded row uses load points too.
  - **Away**: while one of the person's `user_absences` covers today (`awayUntil` from `packages/shared`) the pill reads "Away until …" instead of the load (the load is still computed). Deactivated members are not listed.
- **People / My performance** (period-bound unless noted):
  - **Cards and trends**:
    - **Completed**, **On-time** and **Cycle time** as above, for tasks the person was assigned when they were completed.
    - **Overdue now** = their open overdue tasks.
    - **Completed tasks** (`completedTasks`): the period's completions credited to the person, latest first, at most 200 (`COMPLETED_LIST_LIMIT`; the CSV has all), with local completion time and cycle days; the Completed card opens the list.
    - **Review turnaround**: a review period is credited to the task's `reviewer_id`, else to whoever moved the task **out of** In Review. Turnaround = median length of those review periods. The count is the number of reviews.
    - **Trends**: 12 weekly values (completed count; median cycle time). **Team median** = the median, over members with ≥ 1 completion in those 12 weeks, of each member's weekly average (completed), or the median cycle time of all team completions (cycle).
    - Deltas on this page are neutral: grey chip, arrow only (sideways when unchanged). Cards compare with the previous period only; the team median appears only as the dashed reference line in the two trend charts. No overall good/bad coloring of a person: only **Overdue now** with overdue tasks uses the danger card.
  - **Helping others**:
    - **Comments on others' tasks**: comments by the person on tasks they aren't assigned to.
    - **Subtasks done on others' tasks**: `subtask.completed` by the person on such tasks, plus the number of distinct tasks.
    - **Mentions answered**: the person's @mentions in comments in the period (descriptions don't record when a mention was added, so they don't count), "answered / total". Answered = the person comments on that task within 7 days after the mention. Median reply time = the delay to that comment, shown as "2h" / "2ц" in the tile's tooltip only (the sub-line reads "All answered" / "N unanswered").
    - **Worked with most**: the top 3 people by helping contributions in either direction (person on their tasks + them on the person's tasks). Shown as "N times".
