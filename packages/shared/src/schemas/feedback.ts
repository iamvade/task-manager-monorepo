import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { prioritySchema } from '../enums.js';
import {
  FEEDBACK_MAX_FILE_BYTES,
  FEEDBACK_MAX_FILES,
  FEEDBACK_MIME_TYPES,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_PAGE_SIZE,
  feedbackActivityKindSchema,
  feedbackReportRefSchema,
  feedbackStatusSchema,
  feedbackTypeSchema,
} from '../feedback.js';
import { userRefSchema } from './common.js';
import { taskListItemSchema, taskTitleSchema } from './task.js';

const queryArray = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(item).max(10))
    .optional();

// ---------------------------------------------------------------------------------------------
// Public form (no account)

/** `GET /public/feedback/:slug`: what the public page needs before the person types. */
export const publicFeedbackFormSchema = z
  .object({
    workspaceName: z.string(),
    maxFiles: z.number().int(),
    maxFileBytes: z.number().int(),
    mimeTypes: z.array(z.string()),
  })
  .meta({ id: 'PublicFeedbackForm' });
export type PublicFeedbackForm = z.infer<typeof publicFeedbackFormSchema>;

export const PUBLIC_FEEDBACK_FORM_LIMITS = {
  maxFiles: FEEDBACK_MAX_FILES,
  maxFileBytes: FEEDBACK_MAX_FILE_BYTES,
  mimeTypes: [...FEEDBACK_MIME_TYPES],
};

/**
 * `POST /public/feedback/:slug/uploads`: a file waiting for the form. `token` proves the upload
 * is yours when the form is sent (or when you remove it); it is shown once.
 */
export const publicFeedbackUploadSchema = z
  .object({
    id: z.uuid(),
    token: z.string(),
    filename: z.string(),
    mime: z.string(),
    size: z.number().int(),
  })
  .meta({ id: 'PublicFeedbackUpload' });
export type PublicFeedbackUpload = z.infer<typeof publicFeedbackUploadSchema>;

/** Header carrying an upload's token on `DELETE /public/feedback/uploads/:id`. */
export const FEEDBACK_UPLOAD_TOKEN_HEADER = 'x-upload-token';

/**
 * `POST /public/feedback/:slug`. The fields are checked by `validateFeedbackForm` (400
 * `VALIDATION_ERROR` with `error.fields`), so this schema only bounds their size. `website` is a
 * honeypot: people never see it, bots fill it in.
 */
export const publicFeedbackSubmitSchema = z
  .object({
    type: feedbackTypeSchema.nullable(),
    title: z.string().max(1000),
    body: z.string().max(20_000),
    name: z.string().max(1000).default(''),
    email: z.string().max(1000),
    phone: z.string().max(1000).default(''),
    uploads: z
      .array(z.object({ id: z.uuid(), token: z.string().min(1).max(200) }))
      .max(FEEDBACK_MAX_FILES)
      .default([]),
    /** What the browser knows about the screen (display only; the user agent comes from the request). */
    client: z
      .object({
        screen: z.string().max(40).nullable().optional(),
        viewport: z.string().max(40).nullable().optional(),
        language: z.string().max(40).nullable().optional(),
        timezone: z.string().max(60).nullable().optional(),
      })
      .optional(),
    website: z.string().max(1000).optional(),
  })
  .meta({ id: 'PublicFeedbackSubmit' });
export type PublicFeedbackSubmit = z.input<typeof publicFeedbackSubmitSchema>;

/** The success screen: the reference to quote and a summary of what was sent. */
export const publicFeedbackResultSchema = z
  .object({
    ref: z.string(),
    type: feedbackTypeSchema,
    title: z.string(),
    attachmentCount: z.number().int(),
    email: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'PublicFeedbackResult' });
export type PublicFeedbackResult = z.infer<typeof publicFeedbackResultSchema>;

// ---------------------------------------------------------------------------------------------
// Inbox

/** Device facts: parsed from the request's user agent on the server, plus the browser's screen. */
export const feedbackDeviceSchema = z
  .object({
    /** `Safari 17.4`. */
    browser: z.string().nullable(),
    /** `iOS 17.4`. */
    os: z.string().nullable(),
    /** `iPhone`, `iPad`, `Android phone`, `Mac`, … */
    device: z.string().nullable(),
    kind: z.enum(['desktop', 'mobile', 'tablet']).nullable(),
    screen: z.string().nullable(),
    viewport: z.string().nullable(),
    language: z.string().nullable(),
    timezone: z.string().nullable(),
  })
  .meta({ id: 'FeedbackDevice' });
export type FeedbackDevice = z.infer<typeof feedbackDeviceSchema>;

/** A task in pickers and on the linked-task chip/card. */
export const feedbackTaskRefSchema = taskListItemSchema
  .pick({
    id: true,
    key: true,
    title: true,
    project: true,
    status: true,
    assignees: true,
    dueDate: true,
  })
  .extend({ completedAt: z.iso.datetime().nullable() })
  .meta({ id: 'FeedbackTaskRef' });
export type FeedbackTaskRef = z.infer<typeof feedbackTaskRefSchema>;

export const feedbackListItemSchema = z
  .object({
    id: z.uuid(),
    /** `FB-1042`. */
    ref: z.string(),
    type: feedbackTypeSchema,
    status: feedbackStatusSchema,
    title: z.string(),
    /** The start of the body, on one line. */
    preview: z.string(),
    attachmentCount: z.number().int(),
    submitterName: z.string().nullable(),
    email: z.string(),
    task: feedbackTaskRefSchema.nullable(),
    isRead: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'FeedbackListItem' });
export type FeedbackListItem = z.infer<typeof feedbackListItemSchema>;

export const feedbackListQuerySchema = z.object({
  /** Title, body, submitter name or email; or a ref (`FB-1042`). */
  q: z.string().trim().min(1).max(200).optional(),
  type: feedbackTypeSchema.optional(),
  status: queryArray(feedbackStatusSchema),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(FEEDBACK_PAGE_SIZE),
});
export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;

export const feedbackListResponseSchema = z
  .object({
    /** Newest first. */
    items: z.array(feedbackListItemSchema),
    /** Items matching every filter. */
    total: z.number().int(),
    /** Unread among them. */
    unread: z.number().int(),
    /** Per type tab: the search applied, any status. `all` is every type. */
    typeCounts: z.object({
      all: z.number().int(),
      bug: z.number().int(),
      feature: z.number().int(),
      feedback: z.number().int(),
      other: z.number().int(),
    }),
    /** Per status chip: the search and the type tab applied. */
    statusCounts: z.object({
      new: z.number().int(),
      review: z.number().int(),
      linked: z.number().int(),
      closed: z.number().int(),
    }),
  })
  .meta({ id: 'FeedbackList' });
export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;

export const feedbackAttachmentSchema = z
  .object({
    id: z.uuid(),
    filename: z.string(),
    mime: z.string(),
    size: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'FeedbackAttachment' });
export type FeedbackAttachment = z.infer<typeof feedbackAttachmentSchema>;

/** Snapshot of a task in the log (it may be renamed or deleted later). */
const taskSnapshotSchema = z.object({ id: z.uuid(), key: z.string(), title: z.string() });

export const feedbackActivityDataSchema = z
  .object({
    from: feedbackStatusSchema,
    to: feedbackStatusSchema,
    task: taskSnapshotSchema,
    /** `linked`: the status was set to Linked by the same action. */
    statusSet: z.boolean(),
    /** `unlinked` because the task was deleted (restoring the task links it again). */
    reason: z.literal('task_deleted'),
    /** `assignee_change`: the task's assignees after the change. */
    assignees: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** `similar_found`. */
    similar: z.array(z.object({ id: z.uuid(), ref: z.string() })),
  })
  .partial();
export type FeedbackActivityData = z.infer<typeof feedbackActivityDataSchema>;

export const feedbackActivitySchema = z
  .object({
    id: z.uuid(),
    kind: feedbackActivityKindSchema,
    /** Null for the submitter (`created`) and system rows (`similar_found`). */
    actor: userRefSchema.nullable(),
    text: z.string().nullable(),
    data: feedbackActivityDataSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'FeedbackActivity' });
export type FeedbackActivity = z.infer<typeof feedbackActivitySchema>;

export const feedbackDetailSchema = feedbackListItemSchema
  .omit({ preview: true })
  .extend({
    body: z.string(),
    phone: z.string().nullable(),
    device: feedbackDeviceSchema,
    userAgent: z.string(),
    /** Oldest first. */
    attachments: z.array(feedbackAttachmentSchema),
    /** Every report linked to the same task, this one included, oldest first (empty when unlinked). */
    linkedReports: z.array(feedbackReportRefSchema),
    /** Email the submitter when the linked task is done (stored; no email service yet). */
    notifyOnDone: z.boolean(),
    /** Oldest first. */
    activity: z.array(feedbackActivitySchema),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'FeedbackDetail' });
export type FeedbackDetail = z.infer<typeof feedbackDetailSchema>;

export const updateFeedbackSchema = z
  .object({ status: feedbackStatusSchema })
  .meta({ id: 'UpdateFeedback' });
export type UpdateFeedback = z.infer<typeof updateFeedbackSchema>;

export const feedbackNoteSchema = z
  .object({ text: z.string().trim().min(1).max(FEEDBACK_NOTE_MAX) })
  .meta({ id: 'FeedbackNote' });
export type FeedbackNote = z.infer<typeof feedbackNoteSchema>;

export const linkFeedbackSchema = z.object({ taskId: z.uuid() }).meta({ id: 'LinkFeedback' });
export type LinkFeedback = z.infer<typeof linkFeedbackSchema>;

export const feedbackAssigneesSchema = z
  .object({ userIds: z.array(z.uuid()).max(50) })
  .meta({ id: 'FeedbackAssignees' });
export type FeedbackAssignees = z.infer<typeof feedbackAssigneesSchema>;

/**
 * `POST /feedback/:id/create-task`. `description` is plain text (paragraphs on blank lines); the
 * submitter's email and phone are never copied to the task.
 */
export const feedbackCreateTaskSchema = z
  .object({
    projectId: z.uuid(),
    statusId: z.uuid().optional(),
    title: taskTitleSchema,
    description: z.string().max(20_000).default(''),
    assigneeIds: z.array(z.uuid()).max(50).default([]),
    priority: prioritySchema.default('none'),
    dueDate: dateSchema.nullable().default(null),
    /** Feedback attachments to copy to the task. */
    attachmentIds: z.array(z.uuid()).max(FEEDBACK_MAX_FILES).default([]),
    /** Set the feedback status to Linked (else it keeps its status). */
    setLinked: z.boolean().default(true),
    notifyOnDone: z.boolean().default(false),
  })
  .meta({ id: 'FeedbackCreateTask' });
export type FeedbackCreateTask = z.input<typeof feedbackCreateTaskSchema>;

export const feedbackCreateTaskResultSchema = z
  .object({ feedback: feedbackDetailSchema, task: z.object({ id: z.uuid(), key: z.string() }) })
  .meta({ id: 'FeedbackCreateTaskResult' });
export type FeedbackCreateTaskResult = z.infer<typeof feedbackCreateTaskResultSchema>;

/** Inbox multi-select and the duplicates banner's "Close all". */
export const feedbackBatchSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    change: z.discriminatedUnion('action', [
      z.object({ action: z.literal('status'), status: feedbackStatusSchema }),
      z.object({ action: z.literal('link'), taskId: z.uuid() }),
      z.object({ action: z.literal('unlink') }),
    ]),
  })
  .meta({ id: 'FeedbackBatch' });
export type FeedbackBatch = z.infer<typeof feedbackBatchSchema>;

export const feedbackBatchResultSchema = z
  .object({ changed: z.number().int() })
  .meta({ id: 'FeedbackBatchResult' });

/** Open tasks like this feedback (the link picker's "Similar tasks"). */
export const feedbackTaskSuggestionsSchema = z
  .object({ tasks: z.array(feedbackTaskRefSchema) })
  .meta({ id: 'FeedbackTaskSuggestions' });
export type FeedbackTaskSuggestions = z.infer<typeof feedbackTaskSuggestionsSchema>;

export const feedbackOptionsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});
/** Feedback not linked to any task (the task drawer's "+ Link feedback"). */
export const feedbackOptionsSchema = z
  .object({ items: z.array(feedbackReportRefSchema) })
  .meta({ id: 'FeedbackOptions' });
export type FeedbackOptions = z.infer<typeof feedbackOptionsSchema>;
