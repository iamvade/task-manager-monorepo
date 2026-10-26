import { formatBuildInfo } from '../buildInfo';

const BASE = {
  appVersion: '0.1.0',
  buildVersion: '12',
  apiUrl: 'https://3-120-45-6.sslip.io',
  channel: 'production',
  updateId: '0196b1e2-7f3a-7c11-9a2b-3c4d5e6f7a8b',
  isEmbeddedLaunch: false,
};

describe('formatBuildInfo', () => {
  it('shows version (build), host, channel and the short update id', () => {
    expect(formatBuildInfo(BASE)).toEqual({
      version: '0.1.0 (12)',
      server: '3-120-45-6.sslip.io',
      channel: 'production',
      updateId: '0196b1e2',
    });
  });

  it('has no update id while the bundle built into the binary runs', () => {
    expect(formatBuildInfo({ ...BASE, isEmbeddedLaunch: true }).updateId).toBeNull();
    expect(formatBuildInfo({ ...BASE, updateId: null }).updateId).toBeNull();
  });

  it('copes with a dev client (no build number, no channel)', () => {
    expect(
      formatBuildInfo({ ...BASE, buildVersion: null, channel: '', apiUrl: 'http://10.0.2.2:3000' }),
    ).toMatchObject({ version: '0.1.0', channel: null, server: '10.0.2.2:3000' });
  });
});
