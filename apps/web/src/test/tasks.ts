import type { TaskListItem } from '@kite/shared';
import {
  PROJECT,
  PROJECT_ID,
  PROJECT_WITH_STATUSES,
  TAGS,
  WORKSPACE_ID,
  makeTasks,
} from '@kite/shared/testing';

export {
  PROJECT_WITH_STATUSES,
  STATUSES,
  TAGS,
  at,
  makeTask,
  makeTasks,
  statusOf,
} from '@kite/shared/testing';

/** Handlers for everything the List view loads besides the shell. */
export function listHandlers(tasks: () => TaskListItem[] = makeTasks) {
  return {
    [`GET /api/v1/projects/${PROJECT_ID}`]: () => Response.json(PROJECT_WITH_STATUSES),
    [`GET /api/v1/projects/${PROJECT_ID}/tasks`]: () => Response.json(tasks()),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sprints`]: () =>
      Response.json([{ ...PROJECT.activeSprint, taskCount: 16 }]),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () => Response.json(PROJECT.members),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/tags`]: () =>
      Response.json(
        TAGS.map((tag) => ({
          ...tag,
          taskCount: tasks().filter((t) => t.tags.some((x) => x.id === tag.id)).length,
        })),
      ),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/notification-levels`]: () => Response.json([]),
  };
}
