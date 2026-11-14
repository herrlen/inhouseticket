// Outgoing request budget per provider token (sliding window). ClickUp allows 100 requests per
// minute per token on most plans; we stay below with 90 by default. A 429 blocks the limiter until
// the provider's reset time, so every caller sharing the token waits – not just the one that hit it.
// Clock and sleep are injectable for tests.

export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const DEFAULT_REQUESTS_PER_MINUTE = 90;
const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly sent: number[] = [];
  private blockedUntil = 0;

  constructor(
    readonly perMinute: number = DEFAULT_REQUESTS_PER_MINUTE,
    private readonly clock: Clock = realClock,
  ) {
    if (!Number.isInteger(perMinute) || perMinute < 1) throw new RangeError("perMinute must be a positive integer");
  }

  /** Waits until one more request fits into the window (and any 429 block is over), then counts it. */
  async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      while (this.sent.length && this.sent[0]! <= now - WINDOW_MS) this.sent.shift();
      const wait = Math.max(this.blockedUntil - now, this.sent.length >= this.perMinute ? this.sent[0]! + WINDOW_MS - now : 0);
      if (wait <= 0) {
        this.sent.push(now);
        return;
      }
      await this.clock.sleep(wait);
    }
  }

  /** After a 429: nothing goes out before `until` (epoch ms). */
  blockUntil(until: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, until);
  }

  /** Requests counted in the current window (for tests and diagnostics). */
  inWindow(): number {
    const now = this.clock.now();
    return this.sent.filter((t) => t > now - WINDOW_MS).length;
  }
}

/**
 * X-RateLimit-Reset → epoch ms. ClickUp documents a "Unix timestamp" without a unit; values that
 * look like seconds are scaled. Missing or nonsense values fall back to one minute from now.
 */
export function resetAt(header: string | null, now: number): number {
  const n = Number(header);
  if (!header || !Number.isFinite(n) || n <= 0) return now + WINDOW_MS;
  const ms = n < 1e12 ? n * 1000 : n;
  // Never wait less than a second or longer than two windows on the word of a header.
  return Math.min(Math.max(ms, now + 1000), now + 2 * WINDOW_MS);
}
