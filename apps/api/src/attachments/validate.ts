import { isBlockedFilename } from '@kite/shared';
import { httpError } from '../errors.js';

const MAX_FILENAME = 255;

/** Declared types of executables (the extension and content checks catch the rest). */
const BLOCKED_MIMES = new Set([
  'application/java-archive',
  'application/vnd.android.package-archive',
  'application/vnd.microsoft.portable-executable',
  'application/x-apple-diskimage',
  'application/x-dosexec',
  'application/x-elf',
  'application/x-executable',
  'application/x-mach-binary',
  'application/x-ms-installer',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-sh',
  'application/x-shellscript',
]);

/** Leading bytes of executables: PE (`MZ`), ELF, Mach-O (both endiannesses, 32/64-bit), scripts (`#!`). */
const SIGNATURES = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0x23, 0x21],
].map((bytes) => Buffer.from(bytes));
const SNIFF_BYTES = Math.max(...SIGNATURES.map((s) => s.length));

export const fileTypeBlocked = () =>
  httpError(415, 'FILE_TYPE_BLOCKED', 'Executable files can’t be attached');

/**
 * Display name of an uploaded file: the last path segment, without control characters,
 * NFC-normalized, at most 255 characters (the extension is kept when shortening).
 */
export function sanitizeFilename(raw: string): string {
  // Browsers (and FormData) send `"` in multipart file names as `%22`.
  let name = (raw.replace(/%22/g, '"').split(/[/\\]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .normalize('NFC')
    .trim();
  if (name.length > MAX_FILENAME) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
    // Don't cut a surrogate pair in half.
    const head = name.slice(0, MAX_FILENAME - ext.length).replace(/[\ud800-\udbff]$/, '');
    name = head + ext;
  }
  return name === '' || name === '.' || name === '..' ? 'file' : name;
}

/** `type/subtype` in lower case without parameters, or `application/octet-stream`. */
export function normalizeMime(raw: string | undefined): string {
  const mime = (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][\w!#$&^.+-]*\/[a-z0-9][\w!#$&^.+-]*$/.test(mime) && mime.length <= 127
    ? mime
    : 'application/octet-stream';
}

/** Rejects (415) a file whose name or declared type marks it as executable. */
export function checkDeclaredType(filename: string, mime: string): void {
  if (isBlockedFilename(filename) || BLOCKED_MIMES.has(mime)) throw fileTypeBlocked();
}

const isExecutable = (head: Buffer) =>
  SIGNATURES.some((sig) => head.length >= sig.length && head.subarray(0, sig.length).equals(sig));

/**
 * Passes the file through, failing with 415 `FILE_TYPE_BLOCKED` when the content starts like an
 * executable, whatever the file is called. Lazy: nothing is read until the result is consumed.
 */
export async function* sniffExecutable(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
  let head = Buffer.alloc(0);
  let checked = false;
  for await (const chunk of source) {
    if (checked) {
      yield chunk;
      continue;
    }
    head = Buffer.concat([head, chunk]);
    if (head.length < SNIFF_BYTES) continue;
    if (isExecutable(head)) throw fileTypeBlocked();
    checked = true;
    yield head;
  }
  if (!checked) {
    if (isExecutable(head)) throw fileTypeBlocked();
    if (head.length > 0) yield head;
  }
}
