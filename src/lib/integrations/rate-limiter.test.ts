import { describe, expect, it } from "vitest";
import { RateLimiter, resetAt, type Clock } from "./rate-limiter";

/** Fake clock: sleep advances time instantly and records the waits. */
function fakeClock(start = 1_000_000) {
  let now = start;
  const waits: number[] = [];
  const clock: Clock = {
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  };
  return { clock, waits, advance: (ms: number) => (now += ms), get now() { return now; } };
}

describe("RateLimiter", () => {
  it("lets the budget through, then waits for the window to slide", async () => {
    const c = fakeClock();
    const limiter = new RateLimiter(3, c.clock);
    for (let i = 0; i < 3; i++) await limiter.acquire();
    expect(c.waits).toEqual([]);
    expect(limiter.inWindow()).toBe(3);
    await limiter.acquire();
    expect(c.waits).toEqual([60_000]);
  });

  it("spreads requests: 90 per minute by default", async () => {
    const c = fakeClock();
    const limiter = new RateLimiter(undefined, c.clock);
    const start = c.now;
    for (let i = 0; i < 181; i++) await limiter.acquire();
    // 3 windows started: requests 1–90, 91–180, 181.
    expect(c.now - start).toBe(120_000);
  });

  it("blocks everyone until the reset after a 429", async () => {
    const c = fakeClock();
    const limiter = new RateLimiter(100, c.clock);
    await limiter.acquire();
    limiter.blockUntil(c.now + 15_000);
    await limiter.acquire();
    expect(c.waits).toEqual([15_000]);
    // An earlier block never shortens a later one.
    limiter.blockUntil(c.now + 5_000);
    limiter.blockUntil(c.now + 1_000);
    await limiter.acquire();
    expect(c.waits).toEqual([15_000, 5_000]);
  });

  it("rejects nonsense budgets", () => {
    expect(() => new RateLimiter(0)).toThrow(RangeError);
    expect(() => new RateLimiter(1.5)).toThrow(RangeError);
  });
});

describe("resetAt", () => {
  const now = 1_763_000_000_000;
  it("reads seconds and milliseconds", () => {
    expect(resetAt(String(now / 1000 + 20), now)).toBe(now + 20_000);
    expect(resetAt(String(now + 20_000), now)).toBe(now + 20_000);
  });
  it("clamps to 1 s … 2 min and falls back to one minute", () => {
    expect(resetAt(String(now / 1000 - 5), now)).toBe(now + 1000);
    expect(resetAt(String(now / 1000 + 3600), now)).toBe(now + 120_000);
    expect(resetAt(null, now)).toBe(now + 60_000);
    expect(resetAt("soon", now)).toBe(now + 60_000);
  });
});
