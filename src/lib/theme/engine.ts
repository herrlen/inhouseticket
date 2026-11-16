// Copied from emuchat (packages/ui/src/theme/engine.ts) – keep both identical until the shared core
// (emu-core, X1). This app maps the result onto its own variables in ./css.ts.
// Theme engine (Redesign X3): four colors in, every app token out – for light and dark. Text, borders,
// hover and soft tones are derived in OKLCH; any text pairing below WCAG AA (4.5:1) is corrected by
// moving its lightness, and the result says which colors were corrected. Meaning colors (status,
// danger …) never follow the theme.
import { contrast, CONTRAST_PAIRS, DARK, LIGHT, type TokenSet } from "./tokens";

export type ThemeColors = { accent: string; rail: string; surface: string; bg: string };
export type PresetId = "emu" | "ozean" | "wald" | "graphit";
/** What is stored (workspace.theme, user_settings.theme): a preset or four own colors. */
export type ThemeInput = { preset: PresetId } | { preset: "custom"; colors: ThemeColors };

export const PRESETS: Record<PresetId, { name: string; colors: ThemeColors }> = {
  emu: { name: "Emu", colors: pick(LIGHT) },
  ozean: {
    name: "Ozean",
    colors: { accent: "#1d5fa8", rail: "#132031", surface: "#edf2f7", bg: "#ffffff" },
  },
  wald: {
    name: "Wald",
    colors: { accent: "#1f6b3a", rail: "#15241a", surface: "#edf3ee", bg: "#ffffff" },
  },
  graphit: {
    name: "Graphit",
    colors: { accent: "#4a4d57", rail: "#1c1d21", surface: "#f0f0f2", bg: "#ffffff" },
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

const HEX = /^#[0-9a-f]{6}$/;
const COLOR_KEYS = ["accent", "rail", "surface", "bg"] as const;

function pick(tokens: TokenSet): ThemeColors {
  return { accent: tokens.accent!, rail: tokens.rail!, surface: tokens.surface!, bg: tokens.bg! };
}

/** A stored or submitted theme, or null when it is not one (unknown preset, bad color). */
export function parseTheme(value: unknown): ThemeInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.preset === "string" && v.preset in PRESETS) return { preset: v.preset as PresetId };
  if (v.preset !== "custom" || !v.colors || typeof v.colors !== "object") return null;
  const c = v.colors as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const key of COLOR_KEYS) {
    const hex = typeof c[key] === "string" ? (c[key] as string).trim().toLowerCase() : "";
    if (!HEX.test(hex)) return null;
    colors[key] = hex;
  }
  return { preset: "custom", colors };
}

// --- OKLCH (Björn Ottosson's OKLab) ---------------------------------------------------------------

type Oklch = { l: number; c: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const withL = (hex: string, l: number, chroma?: number) => {
  const o = hexToOklch(hex);
  return oklchToHex({ l: Math.min(1, Math.max(0, l)), c: chroma ?? o.c, h: o.h });
};

/** Moves `hex` lighter or darker (whichever works) until it reaches `min` on every background. */
function ensure(hex: string, backgrounds: string[], min = 4.5): string {
  const ok = (h: string) => backgrounds.every((b) => contrast(h, b) >= min);
  if (ok(hex)) return hex;
  const o = hexToOklch(hex);
  const avg = backgrounds.reduce((s, b) => s + hexToOklch(b).l, 0) / backgrounds.length;
  // Away from the backgrounds first; the other way only if that fails.
  for (const dir of avg > 0.6 ? [-1, 1] : [1, -1]) {
    for (let step = 1; step <= 100; step++) {
      const candidate = oklchToHex({ ...o, l: Math.min(1, Math.max(0, o.l + dir * step * 0.01)) });
      if (ok(candidate)) return candidate;
    }
  }
  return avg > 0.6 ? "#000000" : "#ffffff";
}

/** Dark-mode base colors for a light theme: same hues, dark backgrounds, lighter accent. */
export function darkColors(light: ThemeColors): ThemeColors {
  const tint = hexToOklch(light.surface);
  const tone = (l: number) => oklchToHex({ l, c: Math.min(tint.c, 0.02), h: tint.h });
  const accent = hexToOklch(light.accent);
  return {
    bg: tone(0.19),
    surface: tone(0.22),
    rail: tone(0.14),
    accent: oklchToHex({ l: Math.max(accent.l, 0.72), c: Math.min(accent.c, 0.14), h: accent.h }),
  };
}

const FIXED = [
  "status-open-bg",
  "status-open-fg",
  "status-progress",
  "status-review",
  "status-done",
  "status-fg",
  "danger",
  "warning",
  "info",
  "success",
] as const;

/**
 * Every token from four colors. `corrected` names the given colors that had to move for contrast
 * (accent, rail …), so the settings page can say so.
 */
export function buildTokens(
  input: ThemeColors,
  scheme: "light" | "dark",
): { tokens: TokenSet; corrected: (keyof ThemeColors)[] } {
  const dark = scheme === "dark";
  const corrected = new Set<keyof ThemeColors>();
  const { rail } = input;
  // Backgrounds stay light (or dark) and only lightly tinted, so text and the fixed meaning colors
  // (status, danger …) stay readable on them.
  const clampBackground = (key: "bg" | "surface", min: number, max: number) => {
    const o = hexToOklch(input[key]);
    const l = Math.min(max, Math.max(min, o.l));
    // The content background carries the fixed meaning colors: nearly neutral.
    const c = Math.min(o.c, key === "bg" ? 0.012 : 0.03);
    if (Math.abs(l - o.l) < 0.005 && Math.abs(c - o.c) < 0.002) return input[key];
    corrected.add(key);
    return oklchToHex({ l, c, h: o.h });
  };
  const bg = dark ? clampBackground("bg", 0, 0.22) : clampBackground("bg", 0.97, 1);
  const surface = dark
    ? clampBackground("surface", 0.18, 0.27)
    : clampBackground("surface", 0.92, 0.98);
  const base = hexToOklch(bg);
  const neutral = (l: number) =>
    oklchToHex({ l, c: Math.min(base.c + 0.01, 0.02), h: hexToOklch(surface).h });
  const hover = withL(bg, base.l + (dark ? 0.03 : -0.015));
  const bgs = [bg, surface, hover];

  const text = ensure(neutral(dark ? 0.95 : 0.22), bgs, 7);
  const secondary = ensure(neutral(dark ? 0.86 : 0.34), bgs);
  const muted = ensure(neutral(dark ? 0.72 : 0.5), bgs);
  const railFg = ensure(withL(rail, hexToOklch(rail).l > 0.6 ? 0.3 : 0.85, 0.02), [rail]);
  if (railFg !== withL(rail, hexToOklch(rail).l > 0.6 ? 0.3 : 0.85, 0.02)) corrected.add("rail");

  // The accent carries text (links, active tab) on bg and a label on itself.
  let accent = ensure(input.accent, [bg]);
  if (accent !== input.accent) corrected.add("accent");
  const onAccent =
    contrast("#ffffff", accent) >= contrast("#1a1a1a", accent) ? "#ffffff" : "#1a1a1a";
  const accentContrast = onAccent;
  if (contrast(accentContrast, accent) < 4.5) {
    accent = ensure(accent, [accentContrast]);
    corrected.add("accent");
  }
  const a = hexToOklch(accent);
  const accentSoft = oklchToHex({
    l: dark ? 0.26 : 0.975,
    c: Math.min(a.c, dark ? 0.04 : 0.025),
    h: a.h,
  });
  const accentStrong = ensure(
    oklchToHex({ ...a, l: Math.min(1, Math.max(0, a.l + (dark ? 0.1 : -0.08))) }),
    [bg, surface, accentSoft],
  );

  const fixed = dark ? DARK : LIGHT;
  const tokens: TokenSet = {
    bg,
    surface,
    rail,
    "rail-fg": railFg,
    border: withL(bg, base.l + (dark ? 0.12 : -0.12), 0.015),
    "border-subtle": withL(bg, base.l + (dark ? 0.06 : -0.05), 0.01),
    hover,
    text,
    secondary,
    muted,
    accent,
    "accent-strong": accentStrong,
    "accent-soft": accentSoft,
    "accent-contrast": accentContrast,
  };
  for (const key of FIXED) tokens[key] = fixed[key]!;
  // Text on accent-soft (selected rows) and the rest of the checked pairs.
  tokens.text = ensure(tokens.text!, [accentSoft, bg, surface, hover], 4.5);
  return { tokens, corrected: [...corrected] };
}

/** The tokens for a stored theme; the default "Emu" uses the hand-tuned sets. */
export function themeTokens(theme: ThemeInput | null): {
  light: TokenSet;
  dark: TokenSet;
  corrected: (keyof ThemeColors)[];
} {
  if (!theme || theme.preset === "emu") return { light: LIGHT, dark: DARK, corrected: [] };
  const colors = theme.preset === "custom" ? theme.colors : PRESETS[theme.preset].colors;
  const light = buildTokens(colors, "light");
  const dark = buildTokens(darkColors(colors), "dark");
  return { light: light.tokens, dark: dark.tokens, corrected: light.corrected };
}

/** Which checked pairs miss AA (for tests and the settings hint). */
export function contrastProblems(tokens: TokenSet): string[] {
  return CONTRAST_PAIRS.filter(([fg, bg]) => contrast(tokens[fg]!, tokens[bg]!) < 4.5).map(
    ([fg, bg]) => `${fg}/${bg}`,
  );
}

/**
 * CSS for a theme, same selectors as app-theme.css so it overrides it (rendered as a <style> by the
 * layouts; null theme = nothing to add).
 */
export function themeCss(theme: ThemeInput | null): string {
  if (!theme || theme.preset === "emu") return "";
  const { light, dark } = themeTokens(theme);
  const vars = (t: TokenSet) =>
    Object.entries(t)
      .map(([k, v]) => `--color-${k}:${v}`)
      .join(";");
  return (
    `:root{${vars(light)}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(dark)}}}` +
    `:root[data-theme="dark"]{${vars(dark)}}`
  );
}
