import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch, userRefSchema } from './common.js';

export const subtaskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    assignee: userRefSchema.nullable(),
    dueDate: dateSchema.nullable(),
    done: z.boolean(),
    /** Fractional index within the task. */
    position: z.string(),
  })
  .meta({ id: 'Subtask' });
export type Subtask = z.infer<typeof subtaskSchema>;

export const subtaskTitleSchema = z.string().trim().min(1).max(500);

/** Defaults: not done, no assignee or due date, appended at the end. */
export const createSubtaskSchema = z
  .object({
    title: subtaskTitleSchema,
    assigneeId: z.uuid().nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    position: z.enum(['top', 'bottom']).default('bottom'),
  })
  .meta({ id: 'CreateSubtask' });
export type CreateSubtask = z.input<typeof createSubtaskSchema>;

export const updateSubtaskSchema = z
  .object({
    title: subtaskTitleSchema,
    assigneeId: z.uuid().nullable(),
    dueDate: dateSchema.nullable(),
    done: z.boolean(),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateSubtask' });
export type UpdateSubtask = z.input<typeof updateSubtaskSchema>;
