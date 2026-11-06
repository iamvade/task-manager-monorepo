import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const web = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(web, path));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): string {
  const bytes = read(path);
  expect(bytes.subarray(1, 4).toString('latin1'), `${path} is a PNG`).toBe('PNG');
  return `${String(bytes.readUInt32BE(16))}x${String(bytes.readUInt32BE(20))}`;
}

interface Manifest {
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

describe('installable app (Add to Home Screen)', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8')) as Manifest;

  // Relative URLs resolve against the manifest's own URL, so the same file works at the domain
  // root and under a BASE_PATH (e.g. /task-manager/).
  it('opens standalone over the whole app, which iOS needs for Web Push', () => {
    expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone' });
  });

  it('lists icons that exist at the sizes it claims, including a maskable one', () => {
    for (const icon of manifest.icons) {
      expect(icon.src, 'relative to the manifest').not.toMatch(/^\//);
      const path = `public/${icon.src}`;
      expect(existsSync(resolve(web, path)), path).toBe(true);
      if (icon.type === 'image/png') expect(pngSize(path)).toBe(icon.sizes);
    }
    expect(manifest.icons.map((i) => i.purpose)).toContain('maskable');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  });

  it('links the manifest and a 180px Home Screen icon from the page', () => {
    const html = read('index.html').toString('utf8');
    expect(html).toContain('<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />');
    const touch = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
    expect(touch).toBeDefined();
    expect(pngSize(`public/${(touch ?? '').replace('%BASE_URL%', '')}`)).toBe('180x180');
  });
});
