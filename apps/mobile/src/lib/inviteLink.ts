/** Invite tokens are URL-safe random strings. */
const TOKEN = /^[A-Za-z0-9_-]{16,100}$/;

/**
 * The token from a pasted invite: a web link (`https://host/invite/<token>`), an app link
 * (`kitetasks://invite/<token>`) or the bare token. Null when it isn't one.
 */
export function parseInviteToken(input: string): string | null {
  const text = input.trim();
  if (TOKEN.test(text)) return text;
  const match = /\/invite\/([^/?#\s]+)/.exec(text);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  return token && TOKEN.test(token) ? token : null;
}
