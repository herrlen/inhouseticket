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

const textTokens = ["text", "muted", "accent", ...Object.keys(light).filter((k) => k.endsWith("-ink"))];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme", (_, vars) => {
  it.each(textTokens)("--%s reaches 4.5:1 on --bg and --surface", (token) => {
    const fg = resolve(vars, token);
    expect(contrast(fg, resolve(vars, "bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, resolve(vars, "surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("--accent-contrast is readable on --accent", () => {
    expect(contrast(resolve(vars, "accent-contrast"), resolve(vars, "accent"))).toBeGreaterThanOrEqual(4.5);
  });

  it("--focus is visible (3:1) on --bg and --surface", () => {
    expect(contrast(resolve(vars, "focus"), resolve(vars, "bg"))).toBeGreaterThanOrEqual(3);
    expect(contrast(resolve(vars, "focus"), resolve(vars, "surface"))).toBeGreaterThanOrEqual(3);
  });
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
