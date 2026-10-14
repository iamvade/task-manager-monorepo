import { z } from 'zod';
import { dateSchema, daysBetween } from '../dates.js';
import { prioritySchema, sizeSchema, statusCategorySchema, workspaceRoleSchema } from '../enums.js';
import { MAX_REPORT_DAYS, REPORT_PERIODS, SPRINT_PACES, WORKLOAD_LOADS } from '../reports.js';
import { userRefSchema } from './common.js';
import { taskProjectRefSchema, taskStatusRefSchema } from './task.js';

// ── Queries ──────────────────────────────────────────────────────────────────────────────────

const periodFields = {
  /** `4w` = the 28 days ending today; `week` = Monday → today; `quarter` = quarter to date. */
  period: z.enum(REPORT_PERIODS).default('4w'),
  /** Custom period only. */
  from: dateSchema.optional(),
  to: dateSchema.optional(),
};

const checkCustomPeriod = (
  q: { period: string; from?: string | undefined; to?: string | undefined },
  ctx: z.RefinementCtx,
) => {
  if (q.period !== 'custom') return;
  if (!q.from || !q.to) {
    ctx.addIssue({ code: 'custom', message: 'A custom period needs from and to', path: ['from'] });
    return;
  }
  const days = daysBetween(q.from, q.to) + 1;
  if (days < 1)
    ctx.addIssue({ code: 'custom', message: 'from must not be after to', path: ['to'] });
  if (days > MAX_REPORT_DAYS) {
    ctx.addIssue({
      code: 'custom',
      message: `A custom period is at most ${MAX_REPORT_DAYS} days`,
      path: ['to'],
    });
  }
};

const scopeFields = { spaceId: z.uuid().optional(), projectId: z.uuid().optional() };

export const reportQuerySchema = z
  .object({ ...periodFields, ...scopeFields })
  .superRefine(checkCustomPeriod);
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Most aging tasks the Overview returns by default; `agingLimit` overrides it. */
export const AGING_DEFAULT_LIMIT = 20;
export const AGING_MAX_LIMIT = 500;

export const overviewReportQuerySchema = z
  .object({
    ...periodFields,
    ...scopeFields,
    /** Aging rows to return: 1–500 (default 20), or `all` ("View all"). */
    agingLimit: z
      .union([z.literal('all'), z.coerce.number().int().min(1).max(AGING_MAX_LIMIT)])
      .optional(),
  })
  .superRefine(checkCustomPeriod);
export type OverviewReportQuery = z.infer<typeof overviewReportQuerySchema>;

export const workloadReportQuerySchema = z.object(scopeFields);
export type WorkloadReportQuery = z.infer<typeof workloadReportQuerySchema>;

export const sprintsReportQuerySchema = z
  .object({
    /**
     * Default: the first project in scope (space order, then project order) that has a sprint,
     * else the first project in scope.
     */
    projectId: z.uuid().optional(),
    /** Narrows the default project to one space. */
    spaceId: z.uuid().optional(),
    /** Default: the current sprint, else the latest started, else the newest. Needs projectId. */
    sprintId: z.uuid().optional(),
  })
  .refine((q) => !q.sprintId || q.projectId, {
    message: 'sprintId needs projectId',
    path: ['sprintId'],
  });
export type SprintsReportQuery = z.infer<typeof sprintsReportQuerySchema>;

/** The CSV always names the project (the page knows it from the report). */
export const sprintsExportQuerySchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid().optional(),
});

export const personReportQuerySchema = z.object(periodFields).superRefine(checkCustomPeriod);
export type PersonReportQuery = z.infer<typeof personReportQuerySchema>;

// ── Building blocks ──────────────────────────────────────────────────────────────────────────

const nullableNumber = z.number().nullable();

export const dateRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .meta({ id: 'DateRange' });

export const reportScopeSchema = z
  .object({ workspaceId: z.uuid(), spaceId: z.uuid().nullable(), projectId: z.uuid().nullable() })
  .meta({ id: 'ReportScope' });
export type ReportScope = z.infer<typeof reportScopeSchema>;

/** Completed tasks in the scope, all time; the empty state shows `completed / required`. */
export const reportHistorySchema = z
  .object({ completed: z.number().int(), required: z.number().int() })
  .meta({ id: 'ReportHistory' });

const reportMeta = {
  /** When the numbers were computed ("Updated 5 minutes ago"). */
  generatedAt: z.iso.datetime(),
  /** The caller's today and time zone, which every date bucket uses. */
  today: dateSchema,
  timezone: z.string(),
  scope: reportScopeSchema,
  history: reportHistorySchema,
};

const periodMeta = { range: dateRangeSchema, previousRange: dateRangeSchema };

/** Current period vs the same-length period before it. */
const compared = <T extends z.ZodType>(schema: T) =>
  z.object({ current: schema, previous: schema });

export const completedStatsSchema = z
  .object({
    count: z.number().int(),
    /** Sum of SIZE_POINTS; unsized tasks count 0. */
    points: z.number().int(),
    unsized: z.number().int(),
  })
  .meta({ id: 'CompletedStats' });

export const cycleTimeStatsSchema = z
  .object({
    /** Days, 1 decimal; null without completions. */
    median: nullableNumber,
    p85: nullableNumber,
    count: z.number().int(),
  })
  .meta({ id: 'CycleTimeStats' });

export const onTimeStatsSchema = z
  .object({
    /** Completed on or before the due date (local). */
    onTime: z.number().int(),
    /** Completed tasks that had a due date. */
    total: z.number().int(),
  })
  .meta({ id: 'OnTimeStats' });

export const overdueStatsSchema = z
  .object({ count: z.number().int(), oldestDaysLate: z.number().int().nullable() })
  .meta({ id: 'OverdueStats' });

/** A task row in report tables (aging, carried over, open tasks). */
export const reportTaskSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    title: z.string(),
    priority: prioritySchema,
    size: sizeSchema.nullable(),
    dueDate: dateSchema.nullable(),
    status: taskStatusRefSchema,
    project: taskProjectRefSchema,
    assignees: z.array(userRefSchema),
  })
  .meta({ id: 'ReportTask' });
export type ReportTask = z.infer<typeof reportTaskSchema>;

/** People / My performance "Completed in this period": when (local) and how long it took. */
export const completedReportTaskSchema = reportTaskSchema
  .extend({
    /** Local `YYYY-MM-DD HH:MM` in the caller's time zone. */
    completedAt: z.string(),
    cycleDays: z.number().nullable(),
  })
  .meta({ id: 'CompletedReportTask' });
export type CompletedReportTask = z.infer<typeof completedReportTaskSchema>;

/** Most completed tasks the person report lists (the CSV has them all). */
export const COMPLETED_LIST_LIMIT = 200;

// ── Overview ─────────────────────────────────────────────────────────────────────────────────

export const agingTaskSchema = reportTaskSchema
  .extend({
    enteredAt: z.iso.datetime(),
    daysInStatus: z.number().int(),
    /** More than STALE_DAYS for its category. */
    stale: z.boolean(),
  })
  .meta({ id: 'AgingTask' });
export type AgingTask = z.infer<typeof agingTaskSchema>;

export const throughputWeekSchema = z
  .object({
    /** Monday. */
    weekStart: dateSchema,
    count: z.number().int(),
    /** The current week, still in progress. */
    partial: z.boolean(),
  })
  .meta({ id: 'ThroughputWeek' });

export const overviewReportSchema = z
  .object({
    ...reportMeta,
    ...periodMeta,
    completed: compared(completedStatsSchema),
    cycleTime: compared(cycleTimeStatsSchema),
    onTime: compared(onTimeStatsSchema),
    /** Snapshot: open tasks due before today. */
    overdue: overdueStatsSchema,
    throughput: z.object({
      /** The last 12 Monday–Sunday weeks, oldest first; the last one is partial. */
      weeks: z.array(throughputWeekSchema),
      /** The 12 weeks before those; empty when nothing was completed in them (young workspace). */
      previous: z.array(throughputWeekSchema),
    }),
    /** Median length of status periods that ended in the period, To Do / In Progress / In Review. */
    waits: z.array(
      z.object({
        category: statusCategorySchema.exclude(['done']),
        medianDays: nullableNumber,
        periods: z.number().int(),
      }),
    ),
    aging: z.object({
      /** Open tasks in the scope. */
      total: z.number().int(),
      staleCount: z.number().int(),
      /** The longest-waiting open tasks, days in status descending. */
      tasks: z.array(agingTaskSchema),
    }),
  })
  .meta({ id: 'OverviewReport' });
export type OverviewReport = z.infer<typeof overviewReportSchema>;

// ── Sprints ──────────────────────────────────────────────────────────────────────────────────

export const sprintRefSchema = z
  .object({
    id: z.uuid(),
    number: z.number().int(),
    /** Null = "Sprint {number}", translated. */
    name: z.string().nullable(),
    startDate: dateSchema,
    endDate: dateSchema,
    /** Today falls inside the sprint. */
    current: z.boolean(),
  })
  .meta({ id: 'ReportSprintRef' });
export type ReportSprintRef = z.infer<typeof sprintRefSchema>;

export const sprintTotalsSchema = sprintRefSchema
  .extend({
    committed: z.number().int(),
    added: z.number().int(),
    completed: z.number().int(),
  })
  .meta({ id: 'SprintTotals' });

export const burndownPointSchema = z
  .object({
    /** The sprint start (index 0), then the end of each working day. */
    date: dateSchema,
    /** Open sprint tasks at that point; null after today. */
    remaining: z.number().int().nullable(),
    /** Ideal line: committed → 0 over the working days. */
    ideal: z.number(),
    /** Tasks added to the sprint during that working day (scope-added chips). */
    added: z.number().int(),
  })
  .meta({ id: 'BurndownPoint' });

export const carriedTaskSchema = reportTaskSchema
  .extend({
    /** Earlier sprints of the project this task left unfinished. */
    timesCarried: z.number().int(),
    /** Carried REPLAN_TIMES or more. */
    replan: z.boolean(),
  })
  .meta({ id: 'CarriedTask' });
export type CarriedTask = z.infer<typeof carriedTaskSchema>;

export const sprintDetailSchema = sprintRefSchema
  .extend({
    state: z.enum(['past', 'current', 'future']),
    workingDays: z.object({
      total: z.number().int(),
      /** Working days from the start through today (all of them for a past sprint). */
      elapsed: z.number().int(),
      left: z.number().int(),
    }),
    /** Tasks in the sprint at its start. */
    committed: z.number().int(),
    /** Committed tasks carried over from the previous sprint, and those carried 2+ times. */
    carriedIn: z.number().int(),
    carriedInRepeated: z.number().int(),
    /** Tasks added after the start. Scope = committed + added. */
    added: z.number().int(),
    /** Sprint tasks done by the end (or now, for the current sprint). */
    completed: z.number().int(),
    /** Past sprints: unfinished tasks that moved into the next sprint. */
    carriedOut: z.number().int().nullable(),
    previousSprint: sprintRefSchema.nullable(),
    nextSprint: sprintRefSchema.nullable(),
    burndown: z.array(burndownPointSchema),
    /** Current sprint: where the projected line ends at the current pace; null otherwise. */
    projectedRemaining: nullableNumber,
    pace: z.enum(SPRINT_PACES).nullable(),
    /**
     * Current sprint: the status category its open tasks have waited longest in (median days in
     * their current status); null otherwise or when nothing is open.
     */
    waitingMost: statusCategorySchema.exclude(['done']).nullable(),
    /** Up to 6 sprints ending with this one, oldest first. */
    recent: z.array(sprintTotalsSchema),
    /** Tasks carried over from the previous sprint, most-carried first. */
    carried: z.array(carriedTaskSchema),
  })
  .meta({ id: 'SprintDetail' });
export type SprintDetail = z.infer<typeof sprintDetailSchema>;

export const sprintsReportSchema = z
  .object({
    ...reportMeta,
    /** The requested project, else the default one; null when the scope has no projects. */
    project: taskProjectRefSchema.nullable(),
    /** Newest first. */
    sprints: z.array(sprintRefSchema),
    /** Null when the project has no sprints. */
    sprint: sprintDetailSchema.nullable(),
  })
  .meta({ id: 'SprintsReport' });
export type SprintsReport = z.infer<typeof sprintsReportSchema>;

// ── Workload ─────────────────────────────────────────────────────────────────────────────────

export const WORKLOAD_BUCKETS = ['overdue', 'week', 'later', 'none'] as const;
export const workloadBucketSchema = z.enum(WORKLOAD_BUCKETS);
export type WorkloadBucket = z.infer<typeof workloadBucketSchema>;

const bucketTotals = z.object({ points: z.number().int(), tasks: z.number().int() });

export const workloadTaskSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    title: z.string(),
    priority: prioritySchema,
    size: sizeSchema.nullable(),
    points: z.number().int(),
    dueDate: dateSchema.nullable(),
    bucket: workloadBucketSchema,
    /** Weighs on the load: due within `LOAD_WINDOW_DAYS` (overdue included) or in a current sprint. */
    counted: z.boolean(),
    project: taskProjectRefSchema,
    /** Everyone assigned (the task is listed under each of them). */
    assignees: z.array(userRefSchema),
  })
  .meta({ id: 'WorkloadTask' });
export type WorkloadTask = z.infer<typeof workloadTaskSchema>;

export const workloadPersonSchema = z
  .object({
    user: userRefSchema,
    title: z.string().nullable(),
    capacity: z.number().int(),
    openTasks: z.number().int(),
    /** All open points. */
    points: z.number().int(),
    /** Points of the `counted` tasks: what `load` compares with capacity. */
    loadPoints: z.number().int(),
    buckets: z.object({
      /** Due before today. */
      overdue: bucketTotals,
      /** Due today → Sunday. */
      week: bucketTotals,
      later: bucketTotals,
      none: bucketTotals,
    }),
    load: z.enum(WORKLOAD_LOADS),
    /** By bucket, then due date. */
    tasks: z.array(workloadTaskSchema),
  })
  .meta({ id: 'WorkloadPerson' });
export type WorkloadPerson = z.infer<typeof workloadPersonSchema>;

export const workloadReportSchema = z
  .object({
    ...reportMeta,
    /** Sunday of the current week (end of "Due this week"). */
    weekEnd: dateSchema,
    people: z.array(workloadPersonSchema),
    totals: z.object({ openTasks: z.number().int(), points: z.number().int() }),
  })
  .meta({ id: 'WorkloadReport' });
export type WorkloadReport = z.infer<typeof workloadReportSchema>;

// ── People / My performance ──────────────────────────────────────────────────────────────────

export const personTrendWeekSchema = z
  .object({
    weekStart: dateSchema,
    completed: z.number().int(),
    /** Median cycle time of that week's completions, days; null without any. */
    cycleMedian: nullableNumber,
    partial: z.boolean(),
  })
  .meta({ id: 'PersonTrendWeek' });

export const personReportSchema = z
  .object({
    ...reportMeta,
    ...periodMeta,
    person: z.object({
      user: userRefSchema,
      title: z.string().nullable(),
      role: workspaceRoleSchema,
    }),
    /** Tasks the person was assigned when they were completed. */
    completed: compared(completedStatsSchema),
    onTime: compared(onTimeStatsSchema),
    cycleTime: compared(cycleTimeStatsSchema),
    overdue: overdueStatsSchema,
    /** Review periods credited to the person (reviewer, else whoever moved the task out). */
    reviews: compared(z.object({ medianDays: nullableNumber, count: z.number().int() })),
    trends: z.object({
      /** The last 12 weeks, oldest first. */
      weeks: z.array(personTrendWeekSchema),
      /** Median over active members of their weekly average completions. */
      teamCompletedMedian: nullableNumber,
      /** Median cycle time of all team completions in those weeks. */
      teamCycleMedian: nullableNumber,
    }),
    helping: z.object({
      /** Comments on tasks the person isn't assigned to. */
      comments: compared(z.number().int()),
      /** Subtasks the person checked off on such tasks, and on how many tasks. */
      subtasks: z.object({ count: z.number().int(), tasks: z.number().int() }),
      /** @mentions of the person in comments, answered = they commented within 7 days. */
      mentions: z.object({
        answered: z.number().int(),
        total: z.number().int(),
        medianReplyHours: nullableNumber,
      }),
      /** Top 3 by helping contributions in either direction. */
      workedWith: z.array(z.object({ user: userRefSchema, count: z.number().int() })),
    }),
    /** By due date (none last). */
    openTasks: z.array(reportTaskSchema),
    /** Completed in the period, latest first, at most `COMPLETED_LIST_LIMIT` (count: `completed`). */
    completedTasks: z.array(completedReportTaskSchema),
  })
  .meta({ id: 'PersonReport' });
export type PersonReport = z.infer<typeof personReportSchema>;
