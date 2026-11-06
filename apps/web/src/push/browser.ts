import type { PushSubscriptionInput } from '@kite/shared';
import { BASE_PATH } from '../lib/basePath';

/** The service worker in `public/sw.js` (served `no-cache`, so updates land on the next load). */
export const SERVICE_WORKER_URL = `${BASE_PATH}/sw.js`;

/**
 * Whether this browser can get pushes here:
 * - `insecure`: plain http on a LAN address (push and service workers need https or localhost);
 * - `iosInstall`: iPhone/iPad Safari, which allows push only for a Home Screen app;
 * - `unsupported`: no Push API at all.
 */
export type PushSupport = 'supported' | 'insecure' | 'iosInstall' | 'unsupported';

function isIos(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS reports a Mac user agent; a Mac has no touch points.
  return (
    /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  const hasApi =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApi) return 'supported';
  return isIos() && !isStandalone() ? 'iosInstall' : 'unsupported';
}

/** `default` (never asked), `granted` or `denied` (blocked in the browser's site settings). */
export function notificationPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied';
}

/** VAPID public key (base64url) → the bytes `applicationServerKey` takes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (a?.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

function toInput(subscription: PushSubscription): PushSubscriptionInput {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: `${BASE_PATH}/` });
  return navigator.serviceWorker.ready;
}

/**
 * Subscribes this browser with the server's VAPID key (a subscription made with another key,
 * e.g. before the server's keys changed, is replaced). Asks for permission first when it was
 * never asked, so call it from a click. Null when permission isn't granted.
 */
export async function subscribeBrowser(publicKey: string): Promise<PushSubscriptionInput | null> {
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') return null;
  const reg = await registration();
  const key = base64UrlToBytes(publicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing.options.applicationServerKey, key)) return toInput(existing);
  if (existing) await existing.unsubscribe();
  const created = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  return toInput(created);
}

/** This browser's current subscription (without registering the worker), if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ends this browser's subscription with the push service; returns its endpoint. */
export async function unsubscribeBrowser(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  await subscription.unsubscribe();
  return subscription.endpoint;
}
