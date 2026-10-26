import { resolveApiUrl } from '../config';

const base = { appEnv: 'development', explicit: undefined, hostUri: undefined, platform: 'ios' };

describe('resolveApiUrl', () => {
  it('uses EXPO_PUBLIC_API_URL when set', () => {
    expect(resolveApiUrl({ ...base, explicit: 'https://kite.example.mn/' })).toBe(
      'https://kite.example.mn',
    );
    expect(
      resolveApiUrl({ ...base, appEnv: 'production', explicit: 'https://kite.example.mn' }),
    ).toBe('https://kite.example.mn');
  });

  it('uses the Metro host on port 3000 in development', () => {
    expect(resolveApiUrl({ ...base, hostUri: '192.168.1.20:8081' })).toBe(
      'http://192.168.1.20:3000',
    );
    expect(resolveApiUrl({ ...base, hostUri: 'localhost:8081' })).toBe('http://localhost:3000');
    expect(resolveApiUrl(base)).toBe('http://localhost:3000');
  });

  it("maps localhost to the Android emulator's host alias", () => {
    expect(resolveApiUrl({ ...base, hostUri: 'localhost:8081', platform: 'android' })).toBe(
      'http://10.0.2.2:3000',
    );
    expect(resolveApiUrl({ ...base, hostUri: '192.168.1.20:8081', platform: 'android' })).toBe(
      'http://192.168.1.20:3000',
    );
  });

  it('refuses release builds without a URL', () => {
    expect(() => resolveApiUrl({ ...base, appEnv: 'production' })).toThrow();
  });
});
