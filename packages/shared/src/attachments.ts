/** Largest attachment the API accepts. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Extensions of files that run code when opened; uploads with these are refused. */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  'app',
  'apk',
  'appimage',
  'bat',
  'cmd',
  'com',
  'cpl',
  'deb',
  'dll',
  'dmg',
  'exe',
  'gadget',
  'hta',
  'inf',
  'ipa',
  'jar',
  'js',
  'jse',
  'lnk',
  'msc',
  'msi',
  'msix',
  'msp',
  'pif',
  'pkg',
  'ps1',
  'psm1',
  'reg',
  'rpm',
  'run',
  'scf',
  'scr',
  'sh',
  'so',
  'sys',
  'vb',
  'vbe',
  'vbs',
  'ws',
  'wsc',
  'wsf',
  'wsh',
]);

/**
 * True when the file's extension is blocked. Windows ignores trailing dots and spaces, so
 * `setup.exe.` counts as `.exe`; only the last extension matters (`invoice.pdf.exe` is blocked,
 * `setup.exe.txt` is not).
 */
export function isBlockedFilename(filename: string): boolean {
  const name = filename.replace(/[.\s]+$/, '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return BLOCKED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
