/**
 * Median days per status for a project, from its status periods: `pnpm db:waits [KEY]` (default
 * APP). Closed periods only (the Reports "Where work waits" data); plus a sanity line.
 */
import { todayInZone, workingDaysBetween } from '@kite/shared';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';

const STATUS_NAMES: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Done',
};

const key = (process.argv[2] ?? 'APP').toUpperCase();
const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  const project = (
    await db.execute<{ id: string; name: string; workspace_id: string }>(
      sql`select id, name, workspace_id from projects where key = ${key} limit 1`,
    )
  ).rows[0];
  if (!project) throw new Error(`No project with key ${key}`);

  const waits = await db.execute<{
    category: string;
    status: string | null;
    periods: number;
    median: string;
    p75: string;
  }>(sql`
    select p.category, s.name as status, count(*)::int as periods,
      round((percentile_cont(0.5) within group (
        order by extract(epoch from p.exited_at - p.entered_at)) / 86400)::numeric, 1) as median,
      round((percentile_cont(0.75) within group (
        order by extract(epoch from p.exited_at - p.entered_at)) / 86400)::numeric, 1) as p75
    from task_status_periods p
    join tasks t on t.id = p.task_id and t.deleted_at is null
    left join statuses s on s.id = p.status_id
    where t.project_id = ${project.id} and p.exited_at is not null and p.category <> 'done'
    group by p.category, s.name, s.position
    order by s.position`);

  console.log(`${key} · ${project.name} — median days per status (closed periods)\n`);
  console.log('Status        Periods  Median  P75');
  for (const row of waits.rows) {
    const label = row.status ?? STATUS_NAMES[row.category] ?? row.category;
    console.log(
      `${label.padEnd(13)} ${String(row.periods).padStart(7)}  ${row.median.padStart(6)}  ${row.p75.padStart(4)}`,
    );
  }

  const [counts] = (
    await db.execute<{ tasks: number; open: number; done: number }>(sql`
      select count(*)::int as tasks,
        (select count(*)::int from task_status_periods p join tasks t2 on t2.id = p.task_id
          where t2.project_id = ${project.id} and p.exited_at is null) as open,
        count(*) filter (where completed_at is not null)::int as done
      from tasks where project_id = ${project.id}`)
  ).rows;
  console.log(
    `\n${String(counts?.tasks)} tasks (${String(counts?.done)} done), ${String(counts?.open)} open status periods`,
  );

  const holidays = new Set(
    (
      await db.execute<{ date: string }>(
        sql`select to_char(date, 'YYYY-MM-DD') as date from workspace_holidays where workspace_id = ${project.workspace_id}`,
      )
    ).rows.map((r) => r.date),
  );
  const today = todayInZone('Asia/Ulaanbaatar');
  const sprint = (
    await db.execute<{ number: number; start: string; end: string }>(sql`
      select number, to_char(start_date, 'YYYY-MM-DD') as start, to_char(end_date, 'YYYY-MM-DD') as "end"
      from sprints where project_id = ${project.id} and start_date <= ${today} and end_date >= ${today}
      order by start_date desc limit 1`)
  ).rows[0];
  if (sprint) {
    const total = workingDaysBetween(sprint.start, sprint.end, holidays);
    const day = workingDaysBetween(sprint.start, today, holidays);
    const left = total - day;
    console.log(
      `Sprint ${String(sprint.number)}: ${sprint.start} – ${sprint.end}, day ${String(day)} of ${String(total)} working days · ${String(left)} days left`,
    );
  }
} finally {
  await pool.end();
}
