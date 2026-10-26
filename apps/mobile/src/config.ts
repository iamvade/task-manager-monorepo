import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEV_API_PORT = 3000;

export interface ApiUrlInput {
  /** `extra.appEnv` from app.config.ts. */
  appEnv: string;
  /** `EXPO_PUBLIC_API_URL` (inlined at build time). */
  explicit: string | undefined;
  /** Metro's `host:port` (`Constants.expoConfig.hostUri`), only in dev. */
  hostUri: string | undefined;
  platform: string;
}

/**
 * The API origin. `EXPO_PUBLIC_API_URL` wins; dev builds without it use the machine running Metro
 * (its LAN IP on a phone, so `HOST=0.0.0.0` on the API), port 3000. The Android emulator reaches
 * the Mac's `localhost` as 10.0.2.2. Release builds always have the variable (app.config.ts).
 */
export function resolveApiUrl({ appEnv, explicit, hostUri, platform }: ApiUrlInput): string {
  if (explicit) return explicit.replace(/\/+$/, '');
  if (appEnv !== 'development') throw new Error('EXPO_PUBLIC_API_URL is not set');
  let host = hostUri?.split(':')[0] ?? 'localhost';
  if (platform === 'android' && (host === 'localhost' || host === '127.0.0.1')) host = '10.0.2.2';
  return `http://${host}:${DEV_API_PORT}`;
}

function appEnv(): string {
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra === 'object' && extra !== null && 'appEnv' in extra) return String(extra.appEnv);
  return 'development';
}

let cached: string | undefined;

/** The API origin for this build (no trailing slash; routes are under `/api/v1`). */
export function apiBaseUrl(): string {
  cached ??= resolveApiUrl({
    appEnv: appEnv(),
    explicit: process.env.EXPO_PUBLIC_API_URL,
    hostUri: Constants.expoConfig?.hostUri,
    platform: Platform.OS,
  });
  return cached;
}
