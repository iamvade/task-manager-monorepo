/** Leaves the app for another site (the OAuth client's redirect URI). Separate so tests can watch it. */
export function leaveTo(url: string): void {
  window.location.assign(url);
}
