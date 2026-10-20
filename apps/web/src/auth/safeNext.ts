/** A same-app path to return to after sign-in; anything else falls back to home (My Tasks). */
export function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}
