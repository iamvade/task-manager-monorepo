import type { PaletteKey } from '@kite/shared';

/** Which palette table a key is read from (styles/palette.css); the same key differs per family. */
export type PaletteFamily = 'avatar' | 'space' | 'project' | 'tag';

/** `pal-{family}-{key}`: sets --p-bg / --p-fg (/ --p-dot) for light and dark. */
export function paletteClass(family: PaletteFamily, key: PaletteKey): string {
  return `pal-${family}-${key}`;
}
