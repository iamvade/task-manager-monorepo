/** Unread badge text: 1…9, then 9+. */
export const badgeLabel = (n: number) => (n > 9 ? '9+' : String(n));
