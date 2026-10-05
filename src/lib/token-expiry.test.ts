import { describe, expect, it } from "vitest";
import { endOfBerlinDay, resolveExpiry } from "./token-expiry";

describe("token expiry", () => {
  it("ends at 23:59:59 Berlin time, summer and winter", () => {
    expect(endOfBerlinDay("2026-07-01").toISOString()).toBe("2026-07-01T21:59:59.000Z");
    expect(endOfBerlinDay("2026-12-01").toISOString()).toBe("2026-12-01T22:59:59.000Z");
  });

  it("presets count days from today", () => {
    expect(resolveExpiry("30", null, "2026-10-05")).toEqual({ ok: true, expiresAt: endOfBerlinDay("2026-11-04") });
    expect(resolveExpiry("never", null, "2026-10-05")).toEqual({ ok: true, expiresAt: null });
  });

  it("custom date must be in the future and at most two years ahead", () => {
    expect(resolveExpiry("custom", "2026-12-24", "2026-10-05")).toEqual({ ok: true, expiresAt: endOfBerlinDay("2026-12-24") });
    expect(resolveExpiry("custom", "2026-10-05", "2026-10-05").ok).toBe(false);
    expect(resolveExpiry("custom", "2029-01-01", "2026-10-05").ok).toBe(false);
    expect(resolveExpiry("custom", "kaputt", "2026-10-05").ok).toBe(false);
    expect(resolveExpiry("custom", null, "2026-10-05").ok).toBe(false);
    expect(resolveExpiry("12", null, "2026-10-05").ok).toBe(false);
  });
});
