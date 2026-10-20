// Paths inside the workspace: callers prefix them with `useWsPath()`.

/** `/standup/:groupId` for the group's today, else `/standup/:groupId/:date`. */
export function dayHref(groupId: string, date: string, today?: string): string {
  return date === today ? `/standup/${groupId}` : `/standup/${groupId}/${date}`;
}

/** The current page with `?write=1` (opens the write modal over it). */
export function writeHref(groupId: string, date?: string, today?: string): string {
  return `${date ? dayHref(groupId, date, today) : `/standup/${groupId}`}?write=1`;
}
