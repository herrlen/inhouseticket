import { expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

it("allows up to the limit per window, then asks to retry", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t0 + i).ok).toBe(true);
  expect(rateLimit("k", 3, 60_000, t0 + 10)).toEqual({ ok: false, retryAfterSec: 60 });
  expect(rateLimit("k", 3, 60_000, t0 + 60_000).ok).toBe(true);
  expect(rateLimit("other", 3, 60_000, t0 + 10).ok).toBe(true);
});

it("counts a cost greater than one and rejects what does not fit without counting it", () => {
  const t0 = 2_000_000;
  expect(rateLimit("c", 10, 60_000, t0, 8).ok).toBe(true);
  expect(rateLimit("c", 10, 60_000, t0 + 1, 3).ok).toBe(false);
  expect(rateLimit("c", 10, 60_000, t0 + 2, 2).ok).toBe(true);
  expect(rateLimit("c", 10, 60_000, t0 + 3).ok).toBe(false);
  expect(rateLimit("big", 10, 60_000, t0, 11).ok).toBe(false);
});
