import { z } from 'zod';
import { addDays, dateSchema } from '../dates.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch } from './common.js';

/** A period out of office (`user_absences`), both dates included. */
export const absenceSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    startDate: dateSchema,
    endDate: dateSchema,
    note: z.string().nullable(),
  })
  .meta({ id: 'Absence' });
export type Absence = z.infer<typeof absenceSchema>;

const noteSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .transform((t) => (t === '' ? null : t));

const endNotBeforeStart = (a: { startDate?: string; endDate?: string }) =>
  a.startDate === undefined || a.endDate === undefined || a.endDate >= a.startDate;
const END_BEFORE_START = { message: 'The end date is before the start date', path: ['endDate'] };

/** `POST /workspaces/:id/members/:userId/absences`. */
export const createAbsenceSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema, note: noteSchema.optional() })
  .strict()
  .refine(endNotBeforeStart, END_BEFORE_START)
  .meta({ id: 'CreateAbsence' });
export type CreateAbsence = z.input<typeof createAbsenceSchema>;

/** `PATCH /workspaces/:id/absences/:absenceId`. */
export const updateAbsenceSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema, note: noteSchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .refine(endNotBeforeStart, END_BEFORE_START)
  .meta({ id: 'UpdateAbsence' });
export type UpdateAbsence = z.input<typeof updateAbsenceSchema>;

export const absenceListQuerySchema = z.object({
  /** `past` adds absences that ended before today. */
  include: z.enum(['past']).optional(),
});

/** What member DTOs carry: current and upcoming absences, by start date. */
export const absenceRefSchema = absenceSchema
  .pick({ id: true, startDate: true, endDate: true, note: true })
  .meta({ id: 'AbsenceRef' });
export type AbsenceRef = z.infer<typeof absenceRefSchema>;

/**
 * The absence covering `today` (`YYYY-MM-DD`, the viewer's day), with `until` extended over
 * back-to-back absences that follow it. Null when they're in.
 */
export function currentAbsence(
  absences: readonly Pick<AbsenceRef, 'startDate' | 'endDate' | 'note'>[],
  today: string,
): { until: string; note: string | null } | null {
  const sorted = [...absences].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const covering = sorted.find((a) => a.startDate <= today && a.endDate >= today);
  if (!covering) return null;
  let until = covering.endDate;
  for (const a of sorted) {
    if (a.startDate > covering.startDate && a.startDate <= addDays(until, 1) && a.endDate > until) {
      until = a.endDate;
    }
  }
  return { until, note: covering.note };
}

/** Whether someone is out of office on `today`. */
export const isAway = (member: { absences: readonly AbsenceRef[] }, today: string) =>
  currentAbsence(member.absences, today) !== null;

/** The last day of the absence covering `today`, or null. */
export const awayUntil = (member: { absences: readonly AbsenceRef[] }, today: string) =>
  currentAbsence(member.absences, today)?.until ?? null;
