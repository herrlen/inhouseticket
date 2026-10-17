import { expect, it } from "vitest";
import { addressKey, rateLimit } from "./rate-limit";

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

it("keys per-address counters by a hash, never by the plain address", () => {
  const key = addressKey("sign-in", "Nora@Firma.de");
  expect(key).toMatch(/^sign-in:[A-Za-z0-9_-]{43}$/);
  expect(key.toLowerCase()).not.toContain("nora");
  expect(key.toLowerCase()).not.toContain("firma");
  // Same normalization as before: case and surrounding spaces do not matter.
  expect(addressKey("sign-in", "  nora@firma.DE ")).toBe(key);
  // Different address or different counter: different key.
  expect(addressKey("sign-in", "other@firma.de")).not.toBe(key);
  expect(addressKey("reset", "nora@firma.de")).not.toBe(key);
});

it("an address counted under its hash keeps the limit", () => {
  const t0 = 3_000_000;
  for (let i = 0; i < 2; i++) expect(rateLimit(addressKey("t", "A@firma.de"), 2, 60_000, t0 + i).ok).toBe(true);
  expect(rateLimit(addressKey("t", "a@firma.de"), 2, 60_000, t0 + 5).ok).toBe(false);
  expect(rateLimit(addressKey("t", "b@firma.de"), 2, 60_000, t0 + 5).ok).toBe(true);
});
