/** Prints a project's tasks grouped by status: `pnpm db:print [KEY]` (default APP). */
import { shortName, type StatusCategory } from '@kite/shared';
import { asc, eq, isNull } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import * as schema from '../db/schema/index.js';

const STATUS_NAMES: Record<StatusCategory, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Done',
};

const key = (process.argv[2] ?? 'APP').toUpperCase();
const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.key, key),
    with: {
      space: true,
      statuses: {
        orderBy: asc(schema.statuses.position),
        with: {
          tasks: {
            where: isNull(schema.tasks.deletedAt),
            orderBy: asc(schema.tasks.position),
            with: {
              assignees: { with: { user: true } },
              tags: { with: { tag: true } },
              subtasks: true,
              comments: { where: isNull(schema.comments.deletedAt) },
              sprint: true,
            },
          },
        },
      },
    },
  });
  if (!project) {
    console.error(`No project with key ${key}.`);
    process.exitCode = 1;
  } else {
    const total = project.statuses.reduce((n, s) => n + s.tasks.length, 0);
    console.log(`${project.space.name} › ${project.name} (${project.key}) — ${total} tasks\n`);
    for (const status of project.statuses) {
      console.log(`${status.name ?? STATUS_NAMES[status.category]} (${status.tasks.length})`);
      for (const t of status.tasks) {
        const subDone = t.subtasks.filter((s) => s.done).length;
        const meta = [
          t.assignees.map((a) => shortName(a.user.name)).join(', ') || 'Unassigned',
          t.dueDate ?? 'no due date',
          t.priority,
          t.tags.length ? `[${t.tags.map((x) => x.tag.name).join(', ')}]` : null,
          t.subtasks.length ? `${subDone}/${t.subtasks.length}` : null,
          t.comments.length ? `💬${t.comments.length}` : null,
          t.sprint ? `sprint ${t.sprint.name}` : null,
        ].filter(Boolean);
        console.log(`  ${`${project.key}-${t.number}`.padEnd(9)} ${t.title} · ${meta.join(' · ')}`);
      }
      console.log('');
    }
  }
} finally {
  await pool.end();
}
