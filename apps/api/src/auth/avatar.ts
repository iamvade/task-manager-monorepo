import { createHash } from 'node:crypto';
import { AVATAR_COLORS, type PaletteKey } from '@kite/shared';

/** Stable per email, so the same person gets the same color if they're invited again. */
export function avatarColorFor(email: string): PaletteKey {
  const n = createHash('sha256').update(email).digest().readUInt32BE(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length] ?? 'indigo';
}
