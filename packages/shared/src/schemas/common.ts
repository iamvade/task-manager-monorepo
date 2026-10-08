import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';

/** Refinement for PATCH bodies: at least one field. */
export const nonEmptyPatch = (body: object) => Object.keys(body).length > 0;
export const NOTHING_TO_UPDATE = 'Nothing to update';

/**
 * Reorder body: the moved item's neighbors after the move (`null` = list edge). The server
 * computes a fractional-index position between them, so only the moved row changes.
 */
export const moveSchema = z
  .object({
    prevId: z.uuid().nullable().default(null),
    nextId: z.uuid().nullable().default(null),
  })
  .meta({ id: 'Move' });
export type Move = z.infer<typeof moveSchema>;

/** Display fields of a person (avatars, pickers, mentions). */
export const userRefSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    initials: z.string(),
    avatarColor: paletteKeySchema,
  })
  .meta({ id: 'UserRef' });
export type UserRef = z.infer<typeof userRefSchema>;
