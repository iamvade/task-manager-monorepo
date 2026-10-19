import { FEEDBACK_MIME_TYPES, type FeedbackMime } from '@kite/shared';
import { httpError } from '../errors.js';

export const fileTypeNotAllowed = () =>
  httpError(415, 'FILE_TYPE_NOT_ALLOWED', 'Only images, videos and PDF files can be attached');

const ALLOWED: ReadonlySet<string> = new Set(FEEDBACK_MIME_TYPES);

const EXTENSIONS: Record<FeedbackMime, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif', 'heic'],
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov', 'qt'],
  'video/webm': ['webm'],
  'application/pdf': ['pdf'],
};

/** Enough bytes for every check below (ISO BMFF brands sit at 8..11). */
export const SNIFF_BYTES = 16;

const startsWith = (head: Buffer, bytes: number[], at = 0) =>
  head.length >= at + bytes.length && bytes.every((b, i) => head[at + i] === b);
const ascii = (head: Buffer, from: number, to: number) =>
  head.subarray(from, to).toString('latin1');

/**
 * The type the content really is (by its leading bytes), among the allowed ones; null when it's
 * none of them. MP4/MOV/HEIC share the ISO base media container: the brand at bytes 8–11 says which.
 */
export function sniffMime(head: Buffer): FeedbackMime | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(head, 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (brand === 'qt  ') return 'video/quicktime';
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
    return 'video/mp4';
  }
  return null;
}

/** The declared type must be an allowed one and match the file's extension. */
export function checkFeedbackFile(filename: string, declared: string): FeedbackMime {
  if (!ALLOWED.has(declared)) throw fileTypeNotAllowed();
  const mime = declared as FeedbackMime;
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (!EXTENSIONS[mime].includes(ext)) throw fileTypeNotAllowed();
  return mime;
}

/** Same family is enough (a `.mov` that's really MP4, HEIF vs HEIC): browsers mislabel these. */
const family = (mime: string) =>
  mime === 'video/quicktime' ? 'video/mp4' : mime === 'image/heif' ? 'image/heic' : mime;

/**
 * Passes the file through, failing with 415 `FILE_TYPE_NOT_ALLOWED` when its content isn't the
 * declared type (a script renamed `.png`, a PNG renamed `.pdf`). Lazy like `sniffExecutable`.
 */
export async function* sniffDeclared(
  source: AsyncIterable<Buffer>,
  declared: FeedbackMime,
): AsyncGenerator<Buffer> {
  const matches = (head: Buffer) => {
    const actual = sniffMime(head);
    return actual !== null && family(actual) === family(declared);
  };
  let head = Buffer.alloc(0);
  let checked = false;
  for await (const chunk of source) {
    if (checked) {
      yield chunk;
      continue;
    }
    head = Buffer.concat([head, chunk]);
    if (head.length < SNIFF_BYTES) continue;
    if (!matches(head)) throw fileTypeNotAllowed();
    checked = true;
    yield head;
  }
  if (!checked) {
    if (!matches(head)) throw fileTypeNotAllowed();
    if (head.length > 0) yield head;
  }
}
