import { randomUUID } from 'expo-crypto';

/**
 * This app run's id: sent as `X-Kite-Client` with every request and on the realtime socket, so
 * the server doesn't echo the app's own changes back (they're already applied optimistically).
 */
export const CLIENT_ID = randomUUID();
