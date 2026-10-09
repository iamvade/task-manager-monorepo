/** Types the browser may show inline (`?inline=1`); everything else is always a download. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const canInline = (mime: string) => INLINE_TYPES.has(mime);

/**
 * `Content-Disposition` with an ASCII `filename` fallback and the exact UTF-8 name in
 * `filename*` (RFC 6266 / 8187), so Mongolian file names survive the download.
 */
export function contentDisposition(filename: string, type: 'attachment' | 'inline'): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
