import * as SecureStore from 'expo-secure-store';
import { SESSION_KEY, clearSession, currentToken, loadSession, saveSession } from '../session';

const SESSION = { token: 'abc-token', expiresAt: '2026-11-25T00:00:00.000Z' };

describe('session storage', () => {
  beforeEach(async () => {
    await clearSession();
    jest.clearAllMocks();
  });

  it('saves to the Keychain (this device only) and reads it back on the next launch', async () => {
    await saveSession(SESSION);
    expect(currentToken()).toBe('abc-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SESSION_KEY, JSON.stringify(SESSION), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });

    // A new launch starts with nothing in memory.
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(SESSION));
    await expect(loadSession()).resolves.toEqual(SESSION);
    expect(currentToken()).toBe('abc-token');
  });

  it('keeps a session past its expiresAt: the server slides it, a 401 ends it', async () => {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      JSON.stringify({ ...SESSION, expiresAt: '2020-01-01T00:00:00.000Z' }),
    );
    await expect(loadSession()).resolves.toMatchObject({ token: 'abc-token' });
  });

  it('clears an unreadable entry', async () => {
    await SecureStore.setItemAsync(SESSION_KEY, '{not json');
    await expect(loadSession()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    await expect(SecureStore.getItemAsync(SESSION_KEY)).resolves.toBeNull();

    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ token: 42 }));
    await expect(loadSession()).resolves.toBeNull();
  });

  it('treats a Keychain read failure as signed out', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('decrypt failed'));
    await expect(loadSession()).resolves.toBeNull();
    expect(currentToken()).toBeNull();
  });

  it('clears memory and storage on sign-out', async () => {
    await saveSession(SESSION);
    await clearSession();
    expect(currentToken()).toBeNull();
    await expect(SecureStore.getItemAsync(SESSION_KEY)).resolves.toBeNull();
    await expect(loadSession()).resolves.toBeNull();
  });
});
