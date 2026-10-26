import { sessionTokenSchema, type AuthResult } from '@kite/shared';
import * as SecureStore from 'expo-secure-store';

export type StoredSession = NonNullable<AuthResult['session']>;

/** Keychain / Keystore entry holding this app's session (`{ token, expiresAt }`). */
export const SESSION_KEY = 'kite.session';

let current: StoredSession | null = null;

function parse(raw: string | null): StoredSession | null {
  if (raw === null) return null;
  try {
    const parsed = sessionTokenSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads the saved session into memory, once at launch (before any request). An unreadable entry
 * is deleted. `expiresAt` is not checked here: the server slides it on use, so only a 401 says
 * the session is over.
 */
export async function loadSession(): Promise<StoredSession | null> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    // A Keychain entry from an older install can fail to decrypt: treat it as signed out.
    raw = null;
  }
  current = parse(raw);
  if (raw !== null && !current) await clearSession();
  return current;
}

export async function saveSession(session: StoredSession): Promise<void> {
  current = session;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    // Readable after the first unlock, so a background refresh can use it; never synced to iCloud.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  current = null;
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Nothing stored (or the store is unavailable): signed out either way.
  }
}

/** The bearer token for requests and the socket, or null when signed out. */
export function currentToken(): string | null {
  return current?.token ?? null;
}
