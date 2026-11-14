import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE } from "@/lib/palette";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** Extracts `--name: value;` declarations from the first block that starts with `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`block not found: ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

const light = block(":root");
const darkMedia = block(':root:not([data-theme="light"])');
const darkAttr = block(':root[data-theme="dark"]');
const dark = { ...light, ...darkAttr };

function resolve(vars: Record<string, string>, name: string): string {
  let value = vars[name];
  for (let i = 0; value?.startsWith("var(") && i < 5; i++) value = vars[value.slice(6, -1)];
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is not a hex color: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const textTokens = ["text", "secondary", "muted", "accent", "accent-strong", "danger", "warning", "info", "success", ...Object.keys(light).filter((k) => k.endsWith("-ink"))];
/** Backgrounds text sits on: page, cards/panels, the main area, the hover fill. */
const grounds = ["bg", "surface", "content", "hover"];

/**
 * Text/background pairs of the Emu theme (emuchat's CONTRAST_PAIRS, packages/ui/src/theme/tokens.ts):
 * navigation on the sidebar, the selected row, solid status labels.
 */
const PAIRS: [fg: string, bg: string][] = [
  ["text", "sidebar"],
  ["secondary", "sidebar"],
  ["muted", "sidebar"],
  ["accent-strong", "sidebar"],
  ["text", "accent-soft"],
  ["muted", "accent-soft"],
  ["accent-strong", "accent-soft"],
  ["status-open-fg", "status-open-bg"],
  ["status-fg", "status-progress"],
  ["status-fg", "status-review"],
  ["status-fg", "status-done"],
];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme", (_, vars) => {
  it.each(textTokens)("--%s reaches 4.5:1 on --bg, --surface, --content and --hover", (token) => {
    const fg = resolve(vars, token);
    for (const ground of grounds) expect(contrast(fg, resolve(vars, ground)), ground).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PAIRS)("--%s reaches 4.5:1 on --%s", (fg, bg) => {
    expect(contrast(resolve(vars, fg), resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["accent", "accent-hover"])("--accent-contrast is readable on --%s", (fill) => {
    expect(contrast(resolve(vars, "accent-contrast"), resolve(vars, fill))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([...grounds, "sidebar", "accent-soft"])("--focus is visible (3:1) on --%s", (ground) => {
    expect(contrast(resolve(vars, "focus"), resolve(vars, ground))).toBeGreaterThanOrEqual(3);
  });

  it("borders separate zones (--border ≥ 1.3:1 on --content)", () => {
    expect(contrast(resolve(vars, "border"), resolve(vars, "content"))).toBeGreaterThanOrEqual(1.3);
  });
});

// The Emu theme is shared with emuchat (packages/ui/src/theme/tokens.ts): same values, so both
// products look the same. Change both together.
it.each([
  ["light", light, { bg: "#ffffff", surface: "#f4f0ea", text: "#1f1a17", secondary: "#3d352f", muted: "#6b6159", accent: "#9a4a16", "accent-strong": "#7a3a10", "accent-soft": "#fbf3ea", border: "#ddd5cb", "border-subtle": "#eee9e2", hover: "#faf7f3" }],
  ["dark", dark, { bg: "#171310", surface: "#1f1a16", text: "#f3eee9", secondary: "#ddd4cc", muted: "#a99d93", accent: "#e7955a", "accent-strong": "#f2b282", "accent-soft": "#2c2018", border: "#3b332d", "border-subtle": "#2a241f", hover: "#231d19" }],
] as const)("%s values match emuchat's Emu tokens", (_, vars, emu) => {
  // emuchat's `bg` is our main area (--content), its `surface` our sidebar.
  const ours = (name: string) => resolve(vars, name === "bg" ? "content" : name === "surface" ? "sidebar" : name);
  for (const [name, hex] of Object.entries(emu)) expect(ours(name), name).toBe(hex);
});

it.each(Object.keys(light).filter((k) => k.endsWith("-on")))("--%s is readable on its palette fill", (token) => {
  const fill = resolve(light, token.replace(/-on$/, ""));
  expect(contrast(resolve(light, token), fill)).toBeGreaterThanOrEqual(4.5);
});

it.each(Object.entries(PALETTE))("palette.ts %s matches --p-%s in globals.css", (name, hex) => {
  expect(resolve(light, `p-${name}`).toUpperCase()).toBe(hex);
});

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s heatmap", (_, vars) => {
  it.each([1, 2, 3, 4, 5])("text on heat step %i reaches 4.5:1", (step) => {
    expect(contrast(resolve(vars, `heat-ink-${step}`), resolve(vars, `heat-${step}`))).toBeGreaterThanOrEqual(4.5);
  });
});

it("OS dark mode and data-theme=dark define the same values", () => {
  expect(darkMedia).toEqual(darkAttr);
});
