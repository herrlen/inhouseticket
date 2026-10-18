import { describe, expect, it } from "vitest";
import { hasOptOutCookie, measurementRefused } from "./optout";

describe("hasOptOutCookie", () => {
  it.each([
    ["iht_optout=1", true],
    ["lang=de; iht_optout=1", true],
    ["iht_optout=1; lang=de", true],
    ["iht_optout=0", false],
    ["iht_optout=10", false],
    ["x_iht_optout=1", false],
    ["", false],
  ])("%j → %s", (header, expected) => {
    expect(hasOptOutCookie(header)).toBe(expected);
  });

  it("handles a missing header", () => {
    expect(hasOptOutCookie(null)).toBe(false);
    expect(hasOptOutCookie(undefined)).toBe(false);
  });
});

describe("measurementRefused", () => {
  it.each([
    [{ dnt: "1" }, true],
    [{ "sec-gpc": "1" }, true],
    [{ cookie: "iht_optout=1" }, true],
    [{ dnt: "0", cookie: "lang=de" }, false],
    [{}, false],
  ])("%j → %s", (h, expected) => {
    expect(measurementRefused(new Headers(h))).toBe(expected);
  });
});
