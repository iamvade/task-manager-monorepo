/**
 * Push services browsers subscribe through. The server POSTs to whatever endpoint a browser
 * sends, so only these hosts are accepted (no requests into our own network): Chrome and other
 * Chromium browsers (FCM), Firefox (Mozilla autopush), Safari (Apple) and Edge (WNS).
 */
const PUSH_HOSTS: readonly string[] = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES: readonly string[] = ['.push.apple.com', '.notify.windows.com'];

/** An https URL on a known push service, on the default port, without credentials. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
