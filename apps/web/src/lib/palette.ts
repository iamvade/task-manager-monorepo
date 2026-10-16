import { PALETTE_KEYS, type PaletteKey } from '@kite/shared';

/** Which palette table a key is read from (styles/palette.css); the same key differs per family. */
export type PaletteFamily = 'avatar' | 'space' | 'project' | 'tag';

/** `pal-{family}-{key}`: sets --p-bg / --p-fg (/ --p-dot) for light and dark. */
export function paletteClass(family: PaletteFamily, key: PaletteKey): string {
  return `pal-${family}-${key}`;
}

/** A stable color per name, so the same new tag gets the same color everywhere. */
export function colorFor(name: string): PaletteKey {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PALETTE_KEYS[hash % PALETTE_KEYS.length] ?? 'neutral';
}
