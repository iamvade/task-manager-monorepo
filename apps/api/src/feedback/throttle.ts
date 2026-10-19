/**
 * Requests per IP in a fixed window, for the public feedback form only (no account, so the IP is
 * all we have). The rest of the API has no per-IP cap: an office behind one NAT must not be
 * limited. In-memory, so per API process (there is one).
 */
export class IpWindowThrottle {
  private readonly counts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly options: { max: number; windowMs: number },
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a request; returns seconds to wait when over the limit, else 0. */
  hit(ip: string): number {
    const now = this.now();
    if (this.counts.size > 10_000) this.prune(now);
    const entry = this.counts.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.counts.set(ip, { count: 1, resetAt: now + this.options.windowMs });
      return 0;
    }
    if (entry.count >= this.options.max) return Math.ceil((entry.resetAt - now) / 1000);
    entry.count += 1;
    return 0;
  }

  private prune(now: number) {
    for (const [key, entry] of this.counts) if (entry.resetAt <= now) this.counts.delete(key);
  }
}
