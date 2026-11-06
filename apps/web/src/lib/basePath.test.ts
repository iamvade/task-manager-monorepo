import { describe, expect, it } from 'vitest';
import { apiUrl, appUrl, trimBase } from './basePath';

describe('base path', () => {
  it('trims the trailing slash of the Vite base', () => {
    expect(trimBase('/')).toBe('');
    expect(trimBase('/task-manager/')).toBe('/task-manager');
  });

  it('prefixes API and app URLs', () => {
    expect(apiUrl('/auth/me')).toBe('/api/v1/auth/me');
    expect(apiUrl('/auth/me', '/task-manager')).toBe('/task-manager/api/v1/auth/me');
    expect(appUrl('/t/APP-1')).toBe(`${window.location.origin}/t/APP-1`);
    expect(appUrl('/t/APP-1', '/task-manager')).toBe(
      `${window.location.origin}/task-manager/t/APP-1`,
    );
  });
});
