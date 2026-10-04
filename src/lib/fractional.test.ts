import { describe, expect, it } from "vitest";
import { compareKeys, keyBetween, keyForIndex, keysBetween } from "./fractional";
import { initialSortKey } from "./sort-key";

describe("fractional keys", () => {
  it("are compatible with the initial onboarding keys", () => {
    const k = keyBetween(initialSortKey(0), initialSortKey(1));
    expect(compareKeys(initialSortKey(0), k)).toBe(-1);
    expect(compareKeys(k, initialSortKey(1))).toBe(-1);
  });

  it("insert at start, middle and end", () => {
    const keys = keysBetween(null, null, 3);
    expect([...keys].sort(compareKeys)).toEqual(keys);
    const start = keyForIndex(keys, 0);
    const middle = keyForIndex(keys, 2);
    const end = keyForIndex(keys, 3);
    expect(compareKeys(start, keys[0]!)).toBe(-1);
    expect(compareKeys(keys[1]!, middle)).toBe(-1);
    expect(compareKeys(middle, keys[2]!)).toBe(-1);
    expect(compareKeys(keys[2]!, end)).toBe(-1);
  });

  it("stays ordered after many inserts at the same spot", () => {
    let low = "a0";
    const high = "a1";
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(low, high);
      expect(compareKeys(low, next)).toBe(-1);
      expect(compareKeys(next, high)).toBe(-1);
      low = next;
    }
  });

  it("sorts byte-wise, unlike localeCompare", () => {
    expect(["a0", "Zz", "a0V"].sort(compareKeys)).toEqual(["Zz", "a0", "a0V"]);
  });
});
