import type { OutlookError } from '@kite/shared';

/**
 * Hosts Outlook publishes calendars from: Microsoft 365 work/school accounts
 * (`outlook.office365.com`, also `outlook.office.com`) and personal accounts
 * (`outlook.live.com`). The server fetches whatever link a person saves, so only these are
 * accepted (no requests into our own network), on https and the default port.
 */
export const OUTLOOK_HOSTS: readonly string[] = [
  'outlook.office365.com',
  'outlook.office.com',
  'outlook.live.com',
];

/** A published calendar bigger than this isn't read (years of history). */
export const MAX_ICS_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** `fetch`, injectable so tests never reach the network. */
export type IcsFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The link as https on an Outlook host (a `webcal://` link becomes https), or null when it isn't
 * one we fetch.
 */
export function normalizeOutlookLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return null;
  if (!OUTLOOK_HOSTS.includes(url.hostname.toLowerCase())) return null;
  url.hash = '';
  return url.toString();
}

export class IcsFetchError extends Error {
  constructor(readonly code: OutlookError) {
    super(`Outlook calendar fetch failed: ${code}`);
  }
}

/** Reads at most `MAX_ICS_BYTES`; more → `too_large`. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_ICS_BYTES) {
    await response.body?.cancel();
    throw new IcsFetchError('too_large');
  }
  if (!response.body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Leaving the loop early (the throw) cancels the stream.
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_ICS_BYTES) throw new IcsFetchError('too_large');
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches a published calendar. Redirects are followed by hand, at most three, each checked
 * against the Outlook hosts again. Errors carry only a code: the link never reaches a log or an
 * error message.
 */
export async function fetchIcs(fetchFn: IcsFetch, link: string): Promise<string> {
  let url = link;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        redirect: 'manual',
        signal,
        headers: { accept: 'text/calendar, */*;q=0.5' },
      });
    } catch {
      throw new IcsFetchError('unreachable');
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      let next: string | null;
      try {
        next = location ? normalizeOutlookLink(new URL(location, url).toString()) : null;
      } catch {
        next = null;
      }
      if (!next) throw new IcsFetchError('unreachable');
      url = next;
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      throw new IcsFetchError('not_found');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new IcsFetchError('unreachable');
    }
    try {
      return await readCapped(response);
    } catch (e) {
      if (e instanceof IcsFetchError) throw e;
      throw new IcsFetchError('unreachable');
    }
  }
  throw new IcsFetchError('unreachable');
}
