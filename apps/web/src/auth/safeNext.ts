/** A same-app path to return to after sign-in; anything else falls back to My Tasks. */
export function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/my-tasks';
}
