import { describe, expect, it } from "vitest";
import {
  buildTokens,
  contrastProblems,
  darkColors,
  hexToOklch,
  oklchToHex,
  parseTheme,
  PRESET_IDS,
  PRESETS,
  themeCss,
  themeTokens,
} from "./engine";
import { LIGHT } from "./tokens";

// A fixed sequence, so a failure is reproducible.
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const hex = (r: () => number) =>
  "#" +
  [0, 0, 0]
    .map(() =>
      Math.floor(r() * 256)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

describe("theme engine", () => {
  it("round-trips colors through OKLCH", () => {
    for (const c of ["#9a4a16", "#ffffff", "#000000", "#1d5fa8", "#f4f0ea"])
      expect(oklchToHex(hexToOklch(c))).toBe(c);
  });

  it.each(PRESET_IDS)("preset %s reaches AA in light and dark", (id) => {
    const { light, dark } = themeTokens({ preset: id });
    expect(contrastProblems(light)).toEqual([]);
    expect(contrastProblems(dark)).toEqual([]);
  });

  it("keeps every pairing at AA for 50 random color sets, and says what it corrected", () => {
    const r = random(42);
    for (let i = 0; i < 50; i++) {
      const colors = { accent: hex(r), rail: hex(r), surface: hex(r), bg: hex(r) };
      // Backgrounds are light in a light theme; the user picks them, the engine guards the text.
      const light = buildTokens(colors, "light");
      expect(contrastProblems(light.tokens), JSON.stringify(colors)).toEqual([]);
      const dark = buildTokens(darkColors(colors), "dark");
      expect(contrastProblems(dark.tokens), JSON.stringify(colors)).toEqual([]);
    }
  });

  it("names corrected colors", () => {
    const { corrected, tokens } = buildTokens(
      { accent: "#ffe08a", rail: "#2a1f18", surface: "#f4f0ea", bg: "#ffffff" },
      "light",
    );
    expect(corrected).toContain("accent");
    expect(tokens.accent).not.toBe("#ffe08a");
  });

  it("leaves the default Emu theme to app-theme.css", () => {
    expect(themeCss(null)).toBe("");
    expect(themeCss({ preset: "emu" })).toBe("");
    expect(PRESETS.emu.colors.accent).toBe(LIGHT.accent);
    expect(themeCss({ preset: "ozean" })).toContain("--color-accent:#1d5fa8");
  });

  it("accepts only known presets and six-digit colors", () => {
    expect(parseTheme({ preset: "wald" })).toEqual({ preset: "wald" });
    expect(parseTheme({ preset: "pink" })).toBeNull();
    expect(
      parseTheme({
        preset: "custom",
        colors: { accent: "#9A4A16", rail: "#2a1f18", surface: "#f4f0ea", bg: "#ffffff" },
      }),
    ).toEqual({
      preset: "custom",
      colors: { accent: "#9a4a16", rail: "#2a1f18", surface: "#f4f0ea", bg: "#ffffff" },
    });
    expect(
      parseTheme({
        preset: "custom",
        colors: { accent: "red;}body{", rail: "#000", surface: "#fff", bg: "#fff" },
      }),
    ).toBeNull();
  });
});
