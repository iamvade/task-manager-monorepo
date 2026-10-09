import { z } from 'zod';
import { dateSchema } from '../dates.js';
import {
  paletteKeySchema,
  prioritySchema,
  statusCategorySchema,
  templateIdSchema,
  type ActivityType,
} from '../enums.js';

// Activity payloads snapshot display data (names, categories) so history lines like
// "Dorj E. changed status from To Do to In Progress" survive later renames and deletes.

/** `name: null` = default status, translated by category. */
export const statusSnapshotSchema = z
  .object({ id: z.uuid(), name: z.string().nullable(), category: statusCategorySchema })
  .meta({ id: 'StatusSnapshot' });
export type StatusSnapshot = z.infer<typeof statusSnapshotSchema>;

const userSnapshot = z.object({ id: z.uuid(), name: z.string() });
const tagSnapshot = z.object({ id: z.uuid(), name: z.string(), color: paletteKeySchema });
const sprintSnapshot = z.object({ id: z.uuid(), name: z.string() }).nullable();
const subtaskSnapshot = z.object({ id: z.uuid(), title: z.string() });
const attachmentSnapshot = z.object({ id: z.uuid(), filename: z.string() });
/** A task key snapshot (`APP-142`) for duplicate/move history. */
const taskSnapshot = z.object({ id: z.uuid(), key: z.string() });
/** Where a moved task was / went: the project and the task's key in it. */
const projectSnapshot = z.object({ projectId: z.uuid(), name: z.string(), key: z.string() });
const change = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value });

/** Payload of each activity type the API writes. */
export const activityPayloadSchemas = {
  'task.created': z.object({
    status: statusSnapshotSchema.optional(),
    templateId: templateIdSchema.optional(),
    duplicateOf: taskSnapshot.optional(),
  }),
  'title.changed': change(z.string()),
  'description.changed': z.object({}),
  'status.changed': change(statusSnapshotSchema),
  'priority.changed': change(prioritySchema),
  'due.changed': change(dateSchema.nullable()),
  'start.changed': change(dateSchema.nullable()),
  'sprint.changed': change(sprintSnapshot),
  'assignee.added': z.object({ user: userSnapshot }),
  'assignee.removed': z.object({ user: userSnapshot }),
  'tag.added': z.object({ tag: tagSnapshot }),
  'tag.removed': z.object({ tag: tagSnapshot }),
  'subtask.added': z.object({ subtask: subtaskSnapshot }),
  'subtask.completed': z.object({ subtask: subtaskSnapshot }),
  'attachment.added': z.object({ attachment: attachmentSnapshot }),
  'attachment.removed': z.object({ attachment: attachmentSnapshot }),
  /** The comment itself is shown in the feed; this row only dates it and feeds notifications. */
  'comment.added': z.object({ commentId: z.uuid() }),
  'project.changed': change(projectSnapshot),
  'task.deleted': z.object({}),
  'task.restored': z.object({}),
} as const satisfies Partial<Record<ActivityType, z.ZodType>>;

export type TaskActivityType = keyof typeof activityPayloadSchemas;
export type ActivityPayload<T extends TaskActivityType> = z.infer<
  (typeof activityPayloadSchemas)[T]
>;
