import { buildTheme } from '../theme';

describe('buildTheme', () => {
  it('switches palette and accent ink with the scheme', () => {
    const light = buildTheme('light', '#6E56CF');
    const dark = buildTheme('dark', '#6E56CF');
    expect(light.colors.bg).toBe('#ffffff');
    expect(dark.colors.bg).toBe('#111113');
    expect(light.colors.accentInk).toBe('#6C55CC');
    expect(dark.colors.accentInk).toBe('#B4A5FF');
    expect(dark.mobile.toastAction).toBe('#6E56CF');
    expect(light.mobile.toastAction).toBe('#B4A5FF');
    expect(dark.palette.avatar.indigo.dark.bg).toBeDefined();
  });

  it('is memoized per scheme and accent', () => {
    expect(buildTheme('dark', '#2F6FEB')).toBe(buildTheme('dark', '#2F6FEB'));
    expect(buildTheme('dark', '#2F6FEB')).not.toBe(buildTheme('light', '#2F6FEB'));
  });
});
