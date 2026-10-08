import { z } from 'zod';

/** Project keys prefix task numbers (`APP-142`): a letter, then letters or digits, 2–10 chars. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2–10 letters or digits, starting with a letter');

// Mongolian (and Russian) Cyrillic → Latin, one letter where possible so initials stay single.
const CYRILLIC: Record<string, string> = {
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'G',
  Д: 'D',
  Е: 'E',
  Ё: 'YO',
  Ж: 'J',
  З: 'Z',
  И: 'I',
  Й: 'I',
  К: 'K',
  Л: 'L',
  М: 'M',
  Н: 'N',
  О: 'O',
  Ө: 'O',
  П: 'P',
  Р: 'R',
  С: 'S',
  Т: 'T',
  У: 'U',
  Ү: 'U',
  Ф: 'F',
  Х: 'H',
  Ц: 'C',
  Ч: 'C',
  Ш: 'S',
  Щ: 'S',
  Ъ: '',
  Ы: 'Y',
  Ь: '',
  Э: 'E',
  Ю: 'YU',
  Я: 'YA',
};

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const FALLBACK = 'PRJ';

/** Uppercase Latin transliteration; accents are stripped and Cyrillic is mapped. */
export function transliterate(text: string): string {
  return Array.from(text.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase())
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('');
}

/** Latin letter-only words of a name. Digits are dropped: auto keys are letters only. */
function keyWords(name: string): string[] {
  return transliterate(name)
    .split(/[^A-Z0-9]+/)
    .map((word) => word.replace(/[^A-Z]/g, ''))
    .filter(Boolean);
}

/** The first letter, then consonants, then any remaining letters, up to `length`. */
function abbreviate(word: string, length: number): string {
  const rest = word.slice(1).split('');
  const consonants = rest.filter((ch) => !VOWELS.has(ch));
  let key = (word[0] ?? '') + consonants.join('');
  if (key.length < length) key = word;
  return key.slice(0, length);
}

/**
 * Suggested 2–4 letter key: initials of a multi-word name ("Checkout v2" → "CV"), or an
 * abbreviation of a single word ("App" → "APP", "Partner" → "PRT").
 */
export function suggestProjectKey(name: string): string {
  return projectKeyCandidates(name)[0] ?? FALLBACK;
}

/**
 * Keys to try, best first, all 2–4 letters. The server takes the first one not used in the
 * workspace; the list is long enough (hundreds) that it never runs out in practice.
 */
export function projectKeyCandidates(name: string): string[] {
  const words = keyWords(name);
  const [first = '', ...others] = words;
  const last = others[others.length - 1] ?? '';
  const initials = words
    .slice(0, 4)
    .map((word) => word[0])
    .join('');

  const preferred: string[] = [];
  if (others.length > 0) {
    preferred.push(initials);
    // "Partner Portal": PP → PPO → PPOR, then first word variants.
    for (let n = 2; n <= last.length; n++) preferred.push(initials + last.slice(1, n));
  }
  preferred.push(abbreviate(first, 3), abbreviate(first, 4), first.slice(0, 3), first.slice(0, 4));
  if (first.length === 1) preferred.push(`${first}X`);

  const valid = (key: string) => /^[A-Z]{2,4}$/.test(key);
  const ranked = preferred.filter(valid);
  if (ranked.length === 0) ranked.push(FALLBACK);
  const base = ranked[0] ?? FALLBACK;
  const stem3 = base.slice(0, 3);
  const stem2 = base.slice(0, 2);
  const generated = [
    ...LETTERS.map((ch) => stem3 + ch),
    ...LETTERS.flatMap((a) => LETTERS.map((b) => stem2 + a + b)),
  ];
  return [...new Set([...ranked, ...generated.filter(valid)])];
}
