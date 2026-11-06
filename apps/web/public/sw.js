// Kite Tasks service worker: Web Push only (no caching, no offline pages).
// The server sends `{ v: 1, id, workspaceId, title, body, url }` (PushPayload in
// packages/shared/src/schemas/push.ts), encrypted to this browser. Served `no-cache` by Caddy, so
// a new version is picked up on the next page load.

/** Posted to an open tab on click; `usePushSync` (apps/web/src/push/usePush.ts) navigates. */
const OPEN_MESSAGE = 'kite.push.open';

/** A same-origin app path (never `//host`, which would leave the site). */
const isAppPath = (url) => typeof url === 'string' && /^\/(?!\/)/.test(url);

/**
 * Where the app is served: `''` at the domain root, `/task-manager` under a sub-path. The worker
 * is registered at `{BASE}/sw.js` with scope `{BASE}/`, so the scope tells it. Push payloads carry
 * app paths (`/w/…`) without it; URLs the browser fetches or opens get it here.
 */
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, '');

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && data.v === 1 && typeof data.title === 'string' && isAppPath(data.url)) return data;
  } catch {
    // Not JSON: ignored.
  }
  return null;
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (!payload) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Someone looking at Kite right now sees it arrive in the Inbox; no popup on top.
      if (windows.some((client) => client.focused && client.visibilityState === 'visible')) return;
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: `${BASE}/icons/icon-192.png`,
        // One popup per notification: a collapsed one (same id) replaces it and alerts again.
        tag: payload.id,
        renotify: true,
        data: { id: payload.id, url: payload.url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { id, url } = event.notification.data || {};
  if (!isAppPath(url)) return;
  event.waitUntil(
    (async () => {
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
        // Opened = read, like opening it from the Inbox. Best effort.
        fetch(`${BASE}/api/v1/me/notifications/${id}/read`, {
          method: 'POST',
          credentials: 'same-origin',
        }).catch(() => undefined);
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const tab = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        tab.postMessage({ type: OPEN_MESSAGE, url });
        return;
      }
      await self.clients.openWindow(BASE + url);
    })(),
  );
});

// The push service rotated the subscription: subscribe again with the same key and tell the API
// (the session cookie still identifies the person).
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription && event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    (async () => {
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const { keys } = subscription.toJSON();
      await fetch(`${BASE}/api/v1/me/push-subscriptions`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint, keys }),
      });
    })(),
  );
});
