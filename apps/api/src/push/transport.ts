import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushOptions {
  /** Seconds the push service keeps it for an offline browser. */
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
}

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Outcome of one push: `gone` = the push service no longer knows the subscription (404/410),
 * so it should be deleted; `failed` = anything else (kept, tried again next time).
 */
export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number | null };

/** Sends one encrypted push. Tests pass a fake; the app uses `webPushTransport`. */
export type PushTransport = (
  target: PushTarget,
  payload: string,
  options: PushOptions,
) => Promise<PushResult>;

/** Socket timeout for one request to a push service, ms. */
const SEND_TIMEOUT_MS = 10_000;

/** Real Web Push (RFC 8030 + 8291 aes128gcm + VAPID) through the `web-push` package. */
export function webPushTransport(vapid: Vapid): PushTransport {
  return async (target, payload, options) => {
    try {
      await webpush.sendNotification(target, payload, {
        vapidDetails: vapid,
        TTL: options.ttl,
        urgency: options.urgency,
        timeout: SEND_TIMEOUT_MS,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        return {
          ok: false,
          gone: error.statusCode === 404 || error.statusCode === 410,
          status: error.statusCode,
        };
      }
      return { ok: false, gone: false, status: null };
    }
  };
}
