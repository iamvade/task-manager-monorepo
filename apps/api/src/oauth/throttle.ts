/**
 * Failed token requests per IP in a fixed window. Only failures count, and only a failing request
 * is ever refused: every Claude user reaches the token endpoint from the same few Anthropic
 * addresses, so the caller tries each request first and asks this only when it failed. It slows
 * guessing down (the tokens are 256 bits of randomness; this is the second line). In memory, so
 * per API process (there is one).
 */
export class FailureThrottle {
  private readonly counts = new Map<string, { failures: number; resetAt: number }>();

  constructor(
    private readonly options: { max: number; windowMs: number } = {
      max: 30,
      windowMs: 10 * 60_000,
    },
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds to wait when this IP has failed too often, else 0. */
  retryAfter(ip: string): number {
    const now = this.now();
    const entry = this.counts.get(ip);
    if (!entry || entry.resetAt <= now || entry.failures < this.options.max) return 0;
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  fail(ip: string): void {
    const now = this.now();
    if (this.counts.size > 10_000) this.prune(now);
    const entry = this.counts.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.counts.set(ip, { failures: 1, resetAt: now + this.options.windowMs });
    } else {
      entry.failures += 1;
    }
  }

  private prune(now: number) {
    for (const [key, entry] of this.counts) if (entry.resetAt <= now) this.counts.delete(key);
  }
}
