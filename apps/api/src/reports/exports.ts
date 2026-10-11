import type { Locale, PersonReportQuery } from '@kite/shared';
import type { DbOrTx } from '../db/client.js';
import { agingCsv, completedCsv, sprintCsv, workloadCsv } from './csv.js';
import { loadAgingTasks, periodBounds } from './overview.js';
import { completedTasksQuery, loadPerson } from './people.js';
import type { ReportContext } from './scope.js';
import { rows } from './sql.js';
import {
  planSprints,
  sprintQueries,
  sprintTasksQuery,
  toCarried,
  type CarriedRow,
  type SprintTaskRow,
} from './sprints.js';
import { toReportTask, type ReportTaskRow } from './tasks.js';
import { buildWorkload } from './workload.js';

/** Overview CSV: every open task with its days in status (the Aging table, unabridged). */
export async function overviewExport(db: DbOrTx, ctx: ReportContext, locale: Locale) {
  return agingCsv(locale, await loadAgingTasks(db, ctx, null));
}

/** Sprints CSV: the selected sprint's tasks with committed / added / done / times carried. */
export async function sprintsExport(
  db: DbOrTx,
  ctx: ReportContext,
  locale: Locale,
  projectId: string,
  sprintId: string | undefined,
) {
  const plan = await planSprints(db, ctx, projectId, sprintId);
  const prepared = await sprintQueries(db, ctx, plan);
  if (!prepared) return sprintCsv(locale, []);
  const [tasks, carried] = await Promise.all([
    rows<SprintTaskRow>(
      db,
      sprintTasksQuery(prepared.sprint.id, prepared.startIso, prepared.cutoffIso),
    ),
    prepared.queries.carried ? rows<CarriedRow>(db, prepared.queries.carried) : [],
  ]);
  const carriedById = new Map(carried.map((c) => [c.id, toCarried(c)]));
  return sprintCsv(
    locale,
    tasks.map((t) => {
      const c = carriedById.get(t.id);
      return {
        task: toReportTask(t),
        committed: t.committed,
        added: t.added,
        done: t.done,
        timesCarried: c?.timesCarried ?? 0,
        replan: c?.replan ?? false,
      };
    }),
  );
}

export async function workloadExport(db: DbOrTx, ctx: ReportContext, locale: Locale) {
  return workloadCsv(locale, (await buildWorkload(db, ctx)).people);
}

/** People CSV / "Export my data": the person's completed tasks in the period. */
export async function personExport(
  db: DbOrTx,
  ctx: ReportContext,
  locale: Locale,
  userId: string,
  query: PersonReportQuery,
) {
  await loadPerson(db, ctx.workspaceId, userId);
  const b = periodBounds(ctx, query);
  const done = await rows<ReportTaskRow & { completed_local: string; cycle: number | null }>(
    db,
    completedTasksQuery(ctx, b, userId),
  );
  return completedCsv(
    locale,
    done.map((r) => ({
      task: toReportTask(r),
      completedAt: r.completed_local,
      cycleDays: r.cycle,
    })),
  );
}
