import { describe, expect, it } from 'vitest';
import { isBlockedFilename } from './attachments.js';

describe('isBlockedFilename', () => {
  it('blocks executables by their last extension, any case', () => {
    expect(isBlockedFilename('setup.exe')).toBe(true);
    expect(isBlockedFilename('SETUP.EXE')).toBe(true);
    expect(isBlockedFilename('invoice.pdf.exe')).toBe(true);
    expect(isBlockedFilename('deploy.sh')).toBe(true);
    expect(isBlockedFilename('Тайлан.BAT')).toBe(true);
  });

  it('ignores trailing dots and spaces like Windows does', () => {
    expect(isBlockedFilename('setup.exe.')).toBe(true);
    expect(isBlockedFilename('setup.exe . ')).toBe(true);
  });

  it('allows documents, images and names without an extension', () => {
    expect(isBlockedFilename('checkout-mobile-360.png')).toBe(false);
    expect(isBlockedFilename('Spec.pdf')).toBe(false);
    expect(isBlockedFilename('setup.exe.txt')).toBe(false);
    expect(isBlockedFilename('README')).toBe(false);
    expect(isBlockedFilename('.env')).toBe(false);
  });
});
