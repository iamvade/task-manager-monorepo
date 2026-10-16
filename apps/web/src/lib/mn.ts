/**
 * Mongolian ablative ("from") suffix after a numeral, by how the number is read aloud:
 * 142 → "142-оос" (хоёр), 5 → "5-аас" (тав), 1 → "1-ээс" (нэг), 20 → "20-иос" (хорь).
 */
export function mnFrom(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  return `${String(n)}-${mnAblativeSuffix(abs)}`;
}

const ONES = ['', 'ээс', 'оос', 'аас', 'өөс', 'аас', 'гаас', 'гоос', 'аас', 'өөс'];
const TENS = ['', 'аас', 'иос', 'аас', 'өөс', 'иас', 'аас', 'аас', 'гаас', 'өөс'];

function mnAblativeSuffix(n: number): string {
  if (n === 0) return 'ээс'; // тэг
  const ones = n % 10;
  if (ones) return ONES[ones] ?? 'аас';
  const tens = Math.floor(n / 10) % 10;
  if (tens) return TENS[tens] ?? 'аас';
  // зуу, мянга, сая… all take -гаас.
  return n % 1_000_000 === 0 && n >= 1_000_000 ? 'аас' : 'гаас';
}
