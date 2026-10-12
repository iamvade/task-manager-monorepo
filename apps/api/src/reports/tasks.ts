import {
  formatTaskKey,
  type PaletteKey,
  type Priority,
  type ReportTask,
  type Size,
  type StatusCategory,
  type UserRef,
} from '@kite/shared';
import { sql } from 'drizzle-orm';

/** The task's assignees as a JSON array of user refs, by name (`alias` = the tasks row). */
export const assigneesColumn = (alias: string) => sql`
  coalesce((
    select json_agg(json_build_object(
      'id', u.id, 'name', u.name, 'initials', u.initials, 'avatarColor', u.avatar_color
    ) order by u.name, u.id)
    from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = ${sql.raw(alias)}.id
  ), '[]'::json) as assignees`;

/** Columns of a report task row; the query aliases tasks `t`, statuses `s`, projects `p`. */
export const reportTaskColumns = sql`
  t.id, t.number, t.title, t.priority, t.size, t.due_date::text as due_date,
  s.id as status_id, s.name as status_name, s.category as status_category, s.color as status_color,
  p.id as project_id, p.space_id as project_space_id, p.key as project_key,
  p.name as project_name, p.color as project_color,
  ${assigneesColumn('t')}`;

export const reportTaskJoins = sql`
  join statuses s on s.id = t.status_id
  join projects p on p.id = t.project_id`;

export interface ReportTaskRow extends Record<string, unknown> {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  size: Size | null;
  due_date: string | null;
  status_id: string;
  status_name: string | null;
  status_category: StatusCategory;
  status_color: string | null;
  project_id: string;
  project_space_id: string;
  project_key: string;
  project_name: string;
  project_color: PaletteKey;
  assignees: UserRef[];
}

export const toReportTask = (r: ReportTaskRow): ReportTask => ({
  id: r.id,
  key: formatTaskKey(r.project_key, r.number),
  title: r.title,
  priority: r.priority,
  size: r.size,
  dueDate: r.due_date,
  status: {
    id: r.status_id,
    name: r.status_name,
    category: r.status_category,
    color: r.status_color,
  },
  project: {
    id: r.project_id,
    spaceId: r.project_space_id,
    key: r.project_key,
    name: r.project_name,
    color: r.project_color,
  },
  assignees: r.assignees,
});
