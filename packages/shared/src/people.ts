/** "Anu Bold" → "Anu B."; names already in short form ("Sara K.") are returned as is. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first;
  return `${first} ${last.charAt(0)}.`;
}

/** "Anu Bold" → "AB"; a single word gives one letter ("Anu" → "A"). */
export function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
