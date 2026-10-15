import { describe, expect, it } from 'vitest';
import { apiUrl, appUrl, trimBase } from './basePath';

describe('base path', () => {
  it('trims the trailing slash of the Vite base', () => {
    expect(trimBase('/')).toBe('');
    expect(trimBase('/tasks/')).toBe('/tasks');
  });

  it('prefixes API and app URLs', () => {
    expect(apiUrl('/auth/me')).toBe('/api/v1/auth/me');
    expect(apiUrl('/auth/me', '/tasks')).toBe('/tasks/api/v1/auth/me');
    expect(appUrl('/t/APP-1', '/tasks')).toBe(`${window.location.origin}/tasks/t/APP-1`);
  });
});
