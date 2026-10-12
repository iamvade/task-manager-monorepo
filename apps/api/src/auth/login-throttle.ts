/**
 * Failed sign-in counters. Only failures count and a success clears them, so nobody can lock a
 * colleague out by hammering their email from elsewhere with a handful of requests:
 * - per email + IP: `perClient` failures per window (guessing from one place);
 * - per email: `perAccount` failures per window from anywhere (guessing from many IPs).
 *
 * In-memory, so per API process; the per-IP route limit still applies on top.
 */
export class LoginThrottle {
  private readonly counts = new Map<string, { failures: number; resetAt: number }>();

  constructor(
    private readonly options = { perClient: 5, perAccount: 50, windowMs: 15 * 60_000 },
    private readonly now: () => number = Date.now,
  ) {}

  private keys(email: string, ip: string) {
    const account = `a:${email.toLowerCase()}`;
    return { account, client: `c:${account}|${ip}` };
  }

  private failures(key: string) {
    const entry = this.counts.get(key);
    if (!entry || entry.resetAt <= this.now()) return 0;
    return entry.failures;
  }

  /** Seconds until another attempt is allowed, or 0 when allowed now. */
  retryAfter(email: string, ip: string): number {
    const { account, client } = this.keys(email, ip);
    const blocked = [
      [client, this.options.perClient],
      [account, this.options.perAccount],
    ] as const;
    let wait = 0;
    for (const [key, max] of blocked) {
      if (this.failures(key) >= max) {
        const resetAt = this.counts.get(key)?.resetAt ?? this.now();
        wait = Math.max(wait, Math.ceil((resetAt - this.now()) / 1000));
      }
    }
    return wait;
  }

  fail(email: string, ip: string): void {
    const now = this.now();
    if (this.counts.size > 10_000) this.prune();
    for (const key of Object.values(this.keys(email, ip))) {
      const entry = this.counts.get(key);
      if (!entry || entry.resetAt <= now) {
        this.counts.set(key, { failures: 1, resetAt: now + this.options.windowMs });
      } else {
        entry.failures += 1;
      }
    }
  }

  succeed(email: string, ip: string): void {
    for (const key of Object.values(this.keys(email, ip))) this.counts.delete(key);
  }

  private prune() {
    const now = this.now();
    for (const [key, entry] of this.counts) if (entry.resetAt <= now) this.counts.delete(key);
  }
}
