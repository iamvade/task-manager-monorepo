/**
 * A random v4 UUID. `crypto.randomUUID` exists only in secure contexts (https, localhost), so a
 * plain-http LAN address (`http://10.0.0.5:4173`) falls back to `crypto.getRandomValues`.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  // Version 4 and the RFC 4122 variant.
  const hex = bytes
    .map((b, i) => (i === 6 ? (b & 0x0f) | 0x40 : i === 8 ? (b & 0x3f) | 0x80 : b))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
