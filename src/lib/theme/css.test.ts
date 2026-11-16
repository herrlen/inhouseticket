import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESET_IDS, type ThemeInput } from "./engine";
import { effectiveTheme, FIXED_TEXT, themeCss, themeVars } from "./css";
import { contrast } from "./tokens";

// The same rules as src/app/tokens.test.ts, applied to every theme on top of globals.css: the
// themed variables replace ours, the fixed meaning colors (status, priority, palette inks) stay.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

const baseLight = block(":root");
const baseDark = { ...baseLight, ...block(':root[data-theme="dark"]') };

function resolve(vars: Record<string, string>, name: string): string {
  let value = vars[name];
  for (let i = 0; value?.startsWith("var(") && i < 5; i++) value = vars[value.slice(6, -1)];
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is not a hex color: ${value}`);
  return value;
}

const THEMES: [string, ThemeInput][] = [
  ...PRESET_IDS.filter((id) => id !== "emu").map((id): [string, ThemeInput] => [id, { preset: id }]),
  ["neon on white", { preset: "custom", colors: { accent: "#ffff00", rail: "#ffffff", surface: "#ffffff", bg: "#ffffff" } }],
  ["dark bg chosen for light", { preset: "custom", colors: { accent: "#00ff88", rail: "#000000", surface: "#101010", bg: "#000000" } }],
  ["strong tints", { preset: "custom", colors: { accent: "#e0115f", rail: "#4b0082", surface: "#ffd1dc", bg: "#fff0f5" } }],
  ["mid grey", { preset: "custom", colors: { accent: "#808080", rail: "#808080", surface: "#808080", bg: "#808080" } }],
];

const grounds = ["bg", "surface", "content", "hover"];
const PAIRS: [string, string][] = [
  ["text", "sidebar"],
  ["secondary", "sidebar"],
  ["muted", "sidebar"],
  ["accent-strong", "sidebar"],
  ["text", "accent-soft"],
  ["muted", "accent-soft"],
  ["accent-strong", "accent-soft"],
];

describe.each(THEMES)("theme %s", (_, theme) => {
  const themed = themeVars(theme)!;
  describe.each([
    ["light", { ...baseLight, ...themed.light }],
    ["dark", { ...baseDark, ...themed.dark }],
  ] as const)("%s", (_, vars) => {
    const textTokens = ["text", "secondary", "muted", "accent", "accent-strong", "danger", "warning", "info", "success", ...Object.keys(vars).filter((k) => k.endsWith("-ink"))];

    it("every text color reaches 4.5:1 on --bg, --surface, --content and --hover", () => {
      const misses = textTokens.flatMap((token) => grounds.filter((g) => contrast(resolve(vars, token), resolve(vars, g)) < 4.5).map((g) => `${token}/${g}`));
      expect(misses).toEqual([]);
    });

    it.each(PAIRS)("--%s reaches 4.5:1 on --%s", (fg, bg) => {
      expect(contrast(resolve(vars, fg), resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(["accent", "accent-hover"])("--accent-contrast is readable on --%s", (fill) => {
      expect(contrast(resolve(vars, "accent-contrast"), resolve(vars, fill))).toBeGreaterThanOrEqual(4.5);
    });

    it("--focus is visible (3:1) on every ground", () => {
      for (const g of [...grounds, "sidebar", "accent-soft"]) expect(contrast(resolve(vars, "focus"), resolve(vars, g)), g).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("themeCss", () => {
  it("is empty for the default and for anything that is not a theme", () => {
    expect(themeCss(null)).toBe("");
    expect(themeCss({ preset: "emu" })).toBe("");
    expect(themeCss({ preset: "custom", colors: { accent: "red;}body{x", rail: "#000000", surface: "#ffffff", bg: "#ffffff" } })).toBe("");
    expect(themeCss("ozean")).toBe("");
  });

  it("overrides the variables of globals.css for light, OS dark and explicit dark", () => {
    const out = themeCss({ preset: "ozean" });
    expect(out).toMatch(/^:root\{--bg:#[0-9a-f]{6};/);
    expect(out).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){');
    expect(out).toContain(':root[data-theme="dark"]{');
    expect(out).toContain("--accent:");
    expect(out).not.toContain("--rail");
  });
});

describe("effectiveTheme", () => {
  it("prefers the person's own colors, then the workspace default", () => {
    expect(effectiveTheme({ preset: "wald" }, { preset: "ozean" })).toEqual({ preset: "wald" });
    expect(effectiveTheme(null, { preset: "ozean" })).toEqual({ preset: "ozean" });
    expect(effectiveTheme({ preset: "nope" }, null)).toBeNull();
  });
});

describe("FIXED_TEXT", () => {
  it.each([
    ["light", baseLight, FIXED_TEXT.light],
    ["dark", baseDark, FIXED_TEXT.dark],
  ] as const)("lists every fixed text color of globals.css (%s)", (_, vars, list) => {
    const fixed = ["danger", "warning", "info", "success", ...Object.keys(vars).filter((k) => k.endsWith("-ink"))].map((k) => resolve(vars, k).toLowerCase());
    expect([...new Set(fixed)].sort()).toEqual([...list].sort());
  });
});
