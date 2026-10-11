/** Most entries kept per process; the oldest are dropped first. */
const MAX_ENTRIES = 500;

interface Entry {
  workspaceId: string;
  /** Epoch ms when the value was computed. */
  at: number;
  value: unknown;
}

/**
 * Computed reports, per process, for `ttlMs` (5 min by default; 0 turns caching off). Keys are
 * built by the caller from the report, its normalized query and whatever else changes the
 * numbers (time zone, target person); permissions are checked before every lookup. Any task
 * event in a workspace drops that workspace's entries at once, so a write is never followed
 * by a stale read.
 */
export class ReportCache {
  readonly #entries = new Map<string, Entry>();
  /** Bumped on invalidation, so a computation that raced a write isn't stored. */
  readonly #generation = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly clock: () => Date,
  ) {}

  /**
   * The cached value for `key`, or `compute()`'s result (cached). Returns when it was
   * computed, which reports show as "Updated N minutes ago".
   */
  async get<T>(
    workspaceId: string,
    key: string,
    compute: () => Promise<T>,
  ): Promise<{ value: T; generatedAt: Date }> {
    const now = this.clock().getTime();
    const fullKey = `${workspaceId}|${key}`;
    const hit = this.#entries.get(fullKey);
    if (hit && now - hit.at < this.ttlMs) {
      return { value: hit.value as T, generatedAt: new Date(hit.at) };
    }
    const generation = this.#generation.get(workspaceId) ?? 0;
    const value = await compute();
    if (this.ttlMs > 0 && generation === (this.#generation.get(workspaceId) ?? 0)) {
      this.#entries.delete(fullKey);
      this.#entries.set(fullKey, { workspaceId, at: now, value });
      while (this.#entries.size > MAX_ENTRIES) {
        const oldest = this.#entries.keys().next().value;
        if (oldest === undefined) break;
        this.#entries.delete(oldest);
      }
    }
    return { value, generatedAt: new Date(now) };
  }

  /** Drops every report of a workspace. */
  invalidate(workspaceId: string): void {
    this.#generation.set(workspaceId, (this.#generation.get(workspaceId) ?? 0) + 1);
    for (const [key, entry] of this.#entries) {
      if (entry.workspaceId === workspaceId) this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
