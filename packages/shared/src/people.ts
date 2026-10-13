import { transliterate } from './project-key.js';

/** "Anu Bold" → "Anu B."; names already in short form ("Sara K.") are returned as is. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first;
  return `${first} ${last.charAt(0)}.`;
}

/**
 * Short names for a list of people, made distinct where they collide: two "Бат-Эрдэнэ Г."
 * become "Бат-Эрдэнэ Ганб." and "Бат-Эрдэнэ Гант." (the surname prefix grows until unique);
 * people whose full names are identical keep the full name. Keyed by id.
 */
export function shortNames(people: readonly { id: string; name: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const person of people) {
    const short = shortName(person.name);
    const group = groups.get(short);
    if (group) group.push(person);
    else groups.set(short, [person]);
  }
  for (const [short, group] of groups) {
    const distinct = new Set(group.map((p) => p.name.trim()));
    if (distinct.size === 1) {
      for (const p of group) result.set(p.id, short);
      continue;
    }
    const parts = group.map((p) => {
      const words = p.name.trim().split(/\s+/);
      return { p, first: words[0] ?? '', last: words[words.length - 1] ?? '' };
    });
    const longest = Math.max(...parts.map((x) => x.last.length));
    for (const x of parts) {
      let label = x.p.name.trim();
      for (let n = 1; n < longest; n++) {
        const prefix = x.last.slice(0, n);
        const clash = parts.some(
          (y) => y !== x && y.last.slice(0, n) === prefix && y.p.name.trim() !== x.p.name.trim(),
        );
        if (!clash) {
          label = n >= x.last.length ? x.p.name.trim() : `${x.first} ${prefix}.`;
          break;
        }
      }
      result.set(x.p.id, label);
    }
  }
  return result;
}

// Latin spellings of Mongolian sounds that `transliterate` writes with one letter.
const LATIN_DIGRAPHS: [RegExp, string][] = [
  [/kh/g, 'h'],
  [/ts/g, 'c'],
  [/ch/g, 'c'],
  [/sh/g, 's'],
  [/zh/g, 'j'],
];

/**
 * A name or query folded for matching across scripts: Cyrillic transliterated, accents
 * stripped, Latin digraphs (kh, ts, ch, sh, zh) collapsed to the same letters, lowercased.
 * "Bat" and "Бат" fold to "bat"; "Tsogt" and "Цогт" to "cogt".
 */
export function nameSearchKey(text: string): string {
  let key = transliterate(text).toLowerCase();
  for (const [pattern, replacement] of LATIN_DIGRAPHS) key = key.replace(pattern, replacement);
  return key;
}

/** Whether `query` (any script) occurs in `name`, by `nameSearchKey`. */
export function matchesName(name: string, query: string): boolean {
  const q = nameSearchKey(query.trim());
  return q === '' || nameSearchKey(name).includes(q);
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
