import { describe, expect, it } from "vitest";
import { initials } from "@/components/ui/avatar";
import { PALETTE, paletteColorFor, paletteColorFromHex } from "./palette";

describe("palette", () => {
  it("has the 12 colors from KONZEPT §5.2", () => {
    expect(Object.keys(PALETTE)).toHaveLength(12);
  });

  it("maps hex values back to names, case-insensitively", () => {
    expect(paletteColorFromHex("#ff6b5b")).toBe("coral");
    expect(paletteColorFromHex("#123456")).toBeUndefined();
  });

  it("assigns a stable color per seed", () => {
    expect(paletteColorFor("user-1")).toBe(paletteColorFor("user-1"));
    const spread = new Set(Array.from({ length: 50 }, (_, i) => paletteColorFor(`user-${i}`)));
    expect(spread.size).toBeGreaterThan(6);
  });
});

describe("initials", () => {
  it.each([
    ["Anna Schmidt", "AS"],
    ["max", "M"],
    ["  Jonas   von Weber ", "JW"],
    ["", "?"],
    ["Ölaf Ärger", "ÖÄ"],
  ])("%j → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
