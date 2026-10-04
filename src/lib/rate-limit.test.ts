import { expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

it("allows up to the limit per window, then asks to retry", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t0 + i).ok).toBe(true);
  expect(rateLimit("k", 3, 60_000, t0 + 10)).toEqual({ ok: false, retryAfterSec: 60 });
  expect(rateLimit("k", 3, 60_000, t0 + 60_000).ok).toBe(true);
  expect(rateLimit("other", 3, 60_000, t0 + 10).ok).toBe(true);
});
