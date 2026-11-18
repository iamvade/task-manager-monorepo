import type { OutlookError, OutlookEvent } from '@kite/shared';
import { addDays, outlookErrorSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { outlookCalendars } from '../db/schema/index.js';
import { fetchIcs, IcsFetchError, type IcsFetch } from './fetch.js';
import { expandEvents, parseCalendar } from './ics.js';

/** A fetched calendar is reused this long before the link is fetched again. */
export const OUTLOOK_CACHE_TTL_MS = 10 * 60_000;

type Row = typeof outlookCalendars.$inferSelect;

interface CacheEntry {
  url: string;
  text: string;
  fetchedAt: number;
}

export interface LoadedCalendar {
  connected: boolean;
  /** Null without a link, or when no fetch has ever worked. */
  text: string | null;
  lastSyncedAt: Date | null;
  lastError: OutlookError | null;
}

const asError = (value: string | null): OutlookError | null => {
  const parsed = outlookErrorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * Fetches people's published Outlook calendars and keeps each one's text in memory for
 * `OUTLOOK_CACHE_TTL_MS` (one API instance, see Production). Concurrent loads for the same person
 * share one fetch. A failed fetch keeps serving the last good copy and records the error.
 */
export class OutlookService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly fetchFn: IcsFetch,
  ) {}

  /** Fetches and checks a link without saving it (connecting): the text, or an error code. */
  async probe(url: string): Promise<string> {
    const text = await fetchIcs(this.fetchFn, url);
    if (!parseCalendar(text)) throw new IcsFetchError('not_calendar');
    return text;
  }

  /** After connecting: the probed text is the cache. */
  remember(userId: string, url: string, text: string): void {
    this.cache.set(userId, { url, text, fetchedAt: this.app.clock().getTime() });
  }

  forget(userId: string): void {
    this.cache.delete(userId);
  }

  async row(userId: string): Promise<Row | undefined> {
    const [row] = await this.app.db
      .select()
      .from(outlookCalendars)
      .where(eq(outlookCalendars.userId, userId));
    return row;
  }

  /** The person's calendar text, fetched again when older than the TTL (or `force`). */
  async load(userId: string, options: { force?: boolean } = {}): Promise<LoadedCalendar> {
    const row = await this.row(userId);
    if (!row) {
      this.cache.delete(userId);
      return { connected: false, text: null, lastSyncedAt: null, lastError: null };
    }
    const now = this.app.clock().getTime();
    // A copy fetched for another link (replaced since) is never served.
    const cached = this.cache.get(userId);
    const sameLink = cached?.url === row.url ? cached : undefined;
    if (sameLink && now - sameLink.fetchedAt < OUTLOOK_CACHE_TTL_MS && !options.force) {
      return {
        connected: true,
        text: sameLink.text,
        lastSyncedAt: row.lastSyncedAt,
        lastError: asError(row.lastError),
      };
    }
    try {
      const text = await this.fetchOnce(userId, row.url);
      const syncedAt = this.app.clock();
      this.cache.set(userId, { url: row.url, text, fetchedAt: syncedAt.getTime() });
      await this.app.db
        .update(outlookCalendars)
        .set({ lastSyncedAt: syncedAt, lastError: null })
        .where(eq(outlookCalendars.userId, userId));
      return { connected: true, text, lastSyncedAt: syncedAt, lastError: null };
    } catch (e) {
      const code: OutlookError = e instanceof IcsFetchError ? e.code : 'unreachable';
      if (!(e instanceof IcsFetchError)) {
        this.app.log.warn({ err: e, userId }, 'outlook calendar load failed');
      }
      if (row.lastError !== code) {
        await this.app.db
          .update(outlookCalendars)
          .set({ lastError: code })
          .where(eq(outlookCalendars.userId, userId));
      }
      // Keep the last good copy (if it was for this link), but don't fetch again at once.
      const stale = sameLink?.text ?? null;
      if (stale !== null) this.cache.set(userId, { url: row.url, text: stale, fetchedAt: now });
      return { connected: true, text: stale, lastSyncedAt: row.lastSyncedAt, lastError: code };
    }
  }

  private fetchOnce(userId: string, url: string): Promise<string> {
    const running = this.inFlight.get(userId);
    if (running) return running;
    const promise = this.probe(url).finally(() => {
      this.inFlight.delete(userId);
    });
    this.inFlight.set(userId, promise);
    return promise;
  }

  /**
   * Occurrences between two calendar dates (inclusive). The window is widened by a day on each
   * side in UTC so every zone's local days are covered; the web places them in the viewer's zone.
   */
  events(text: string | null, from: string, to: string): OutlookEvent[] {
    if (text === null) return [];
    const root = parseCalendar(text);
    if (!root) return [];
    return expandEvents(root, {
      from: new Date(`${addDays(from, -1)}T00:00:00Z`),
      to: new Date(`${addDays(to, 2)}T00:00:00Z`),
    });
  }
}
