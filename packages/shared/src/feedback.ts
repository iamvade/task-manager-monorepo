import { z } from 'zod';

// Customer feedback: the public form, the team's inbox, links to tasks.

export const FEEDBACK_TYPES = ['bug', 'feature', 'feedback', 'other'] as const;
export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

/** `linked` is set by linking a task; unlinking goes back to `review`. */
export const FEEDBACK_STATUSES = ['new', 'review', 'linked', 'closed'] as const;
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

/** Rows of a feedback item's "Internal notes & activity" log (team only). */
export const FEEDBACK_ACTIVITY_KINDS = [
  'created',
  'note',
  'status_change',
  'linked',
  'unlinked',
  'assignee_change',
  'similar_found',
] as const;
export const feedbackActivityKindSchema = z.enum(FEEDBACK_ACTIVITY_KINDS);
export type FeedbackActivityKind = z.infer<typeof feedbackActivityKindSchema>;

export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_BODY_MIN = 20;
export const FEEDBACK_BODY_MAX = 10_000;
export const FEEDBACK_NOTE_MAX = 4_000;
export const FEEDBACK_MAX_FILES = 5;
/** Largest file the public form takes (the design's "up to 10 MB each"). */
export const FEEDBACK_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Inbox page size. */
export const FEEDBACK_PAGE_SIZE = 50;
/** Refs start after this number: the first item of a workspace is FB-1001. */
export const FEEDBACK_SEQ_START = 1000;

/**
 * Types the public form accepts (images, video, PDF). The server checks the content too, so a
 * renamed file of another type is refused whatever it claims to be.
 */
export const FEEDBACK_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/pdf',
] as const;
export type FeedbackMime = (typeof FEEDBACK_MIME_TYPES)[number];
/** `accept` of the file input. */
export const FEEDBACK_ACCEPT = 'image/*,video/*,application/pdf';

/** The design's checks: something@something.tld (2+ letters). */
export const FEEDBACK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** At least 8 digits, spaces or dashes, optional leading +. */
export const FEEDBACK_PHONE_RE = /^\+?[\d\s-]{8,}$/;

export const formatFeedbackRef = (number: number) => `FB-${number}`;

/** `FB-1042` (any case) → 1042; null when it isn't a feedback ref. */
export function parseFeedbackRef(ref: string): number | null {
  const match = /^fb-(\d{1,9})$/i.exec(ref.trim());
  return match ? Number(match[1]) : null;
}

/** Field errors of the public form, as the form shows them (and the server answers them). */
export const FEEDBACK_FIELD_ERRORS = [
  'typeRequired',
  'titleRequired',
  'titleTooLong',
  'bodyRequired',
  'bodyTooShort',
  'bodyTooLong',
  'emailRequired',
  'emailInvalid',
  'phoneInvalid',
  'nameTooLong',
] as const;
export type FeedbackFieldError = (typeof FEEDBACK_FIELD_ERRORS)[number];
export type FeedbackFormField = 'type' | 'title' | 'body' | 'email' | 'phone' | 'name';

export interface FeedbackFormValues {
  type: FeedbackType | null;
  title: string;
  body: string;
  name: string;
  email: string;
  phone: string;
}

/** Validates the public form, in field order. Shared by the page and `POST /public/feedback/:slug`. */
export function validateFeedbackForm(
  values: FeedbackFormValues,
): Partial<Record<FeedbackFormField, FeedbackFieldError>> {
  const errors: Partial<Record<FeedbackFormField, FeedbackFieldError>> = {};
  if (!values.type) errors.type = 'typeRequired';
  const title = values.title.trim();
  if (!title) errors.title = 'titleRequired';
  else if (title.length > FEEDBACK_TITLE_MAX) errors.title = 'titleTooLong';
  const body = values.body.trim();
  if (!body) errors.body = 'bodyRequired';
  else if (body.length < FEEDBACK_BODY_MIN) errors.body = 'bodyTooShort';
  else if (body.length > FEEDBACK_BODY_MAX) errors.body = 'bodyTooLong';
  if (values.name.trim().length > 100) errors.name = 'nameTooLong';
  const email = values.email.trim();
  if (!email) errors.email = 'emailRequired';
  else if (email.length > 254 || !FEEDBACK_EMAIL_RE.test(email)) errors.email = 'emailInvalid';
  const phone = values.phone.trim();
  if (phone && (phone.length > 40 || !FEEDBACK_PHONE_RE.test(phone))) errors.phone = 'phoneInvalid';
  return errors;
}

/** What the inbox shows as the submitter when no name was given: the email's local part. */
export const feedbackSubmitterName = (name: string | null, email: string) =>
  name?.trim() || email.split('@')[0] || email;

/** Another report linked to the same task (the duplicates list). */
export const feedbackReportRefSchema = z
  .object({
    id: z.uuid(),
    ref: z.string(),
    type: feedbackTypeSchema,
    status: feedbackStatusSchema,
    title: z.string(),
    submitterName: z.string().nullable(),
    email: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'FeedbackReportRef' });
export type FeedbackReportRef = z.infer<typeof feedbackReportRefSchema>;
