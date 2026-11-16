// Theming (Redesign X3, like emuchat): the engine (./engine.ts, shared with emuchat) builds emuchat's
// token set from a stored theme; this file maps it onto the variables of globals.css and renders
// the CSS the workspace layout puts on the page. Same selectors as globals.css, so it overrides it.
//
// Mapping (see src/app/tokens.test.ts): emuchat's `bg` is our main area (--content), its `surface`
// our sidebar (--sidebar), its `hover` our page/hover fill (--bg, --hover). Cards (--surface) are
// white in light mode like the content and sidebar-dark in dark mode – as in the Emu theme. This
// app has no dark rail, so the rail color is stored (same format as emuchat) but not used.
import { contrast, type TokenSet } from "./tokens";
import { hexToOklch, oklchToHex, parseTheme, themeTokens, type ThemeColors, type ThemeInput } from "./engine";

export type AppVars = Record<string, string>;

/** Moves `hex` away from the backgrounds until it reaches `min` on all of them. */
function ensure(hex: string, backgrounds: string[], min = 4.5): string {
  const ok = (h: string) => backgrounds.every((b) => contrast(h, b) >= min);
  if (ok(hex)) return hex;
  const o = hexToOklch(hex);
  const avg = backgrounds.reduce((s, b) => s + hexToOklch(b).l, 0) / backgrounds.length;
  for (const dir of avg > 0.6 ? [-1, 1] : [1, -1]) {
    for (let step = 1; step <= 100; step++) {
      const candidate = oklchToHex({ ...o, l: Math.min(1, Math.max(0, o.l + dir * step * 0.01)) });
      if (ok(candidate)) return candidate;
    }
  }
  return avg > 0.6 ? "#000000" : "#ffffff";
}

/**
 * The fixed text colors of globals.css (danger … success and every `-ink`: palette, priorities,
 * status kinds). They do not follow a theme and are tuned for the Emu grounds, so a themed ground
 * must keep them readable. css.test.ts keeps this list equal to globals.css.
 */
export const FIXED_TEXT = {
  light: ["#b3261e", "#b45309", "#1d5fa8", "#1f6b3a", "#bd4f43", "#a16412", "#896e00", "#567d18", "#1e7f76", "#007c95", "#306fd4", "#5b5bf7", "#8d55d0", "#ba468b", "#c9184a", "#63738a", "#6b6159", "#6b3fa0"],
  dark: ["#f2867e", "#f0a35c", "#7fb2ec", "#6fcf97", "#ff6b5b", "#ff9f1c", "#f5c400", "#8ac926", "#2ec4b6", "#00b4d8", "#3a86ff", "#8080fa", "#a974e8", "#f15bb5", "#dd6587", "#8190a4", "#a99d93", "#b99be0"],
} as const;

/** Moves a ground lighter (light) or darker (dark) until every fixed text color reads on it. */
function groundFor(hex: string, scheme: "light" | "dark"): string {
  const inks = FIXED_TEXT[scheme];
  const ok = (h: string) => inks.every((ink) => contrast(ink, h) >= 4.5);
  const o = hexToOklch(hex);
  for (let step = 0; step <= 100; step++) {
    const l = Math.min(1, Math.max(0, o.l + (scheme === "light" ? 1 : -1) * step * 0.005));
    const candidate = step === 0 ? hex : oklchToHex({ ...o, l });
    if (ok(candidate)) return candidate;
  }
  return scheme === "light" ? "#ffffff" : "#000000";
}

/** Our variables from one engine token set; text colors re-checked on our extra grounds. */
export function appVars(t: TokenSet, scheme: "light" | "dark"): AppVars {
  const dark = scheme === "dark";
  const content = groundFor(t.bg!, scheme);
  // Dark cards use the sidebar color, so it carries the fixed text colors there.
  const sidebar = dark ? groundFor(t.surface!, scheme) : t.surface!;
  const surface = dark ? sidebar : content;
  const hover = groundFor(t.hover!, scheme);
  const grounds = [hover, surface, content, sidebar, t["accent-soft"]!];
  const text = ensure(t.text!, grounds);
  const secondary = ensure(t.secondary!, grounds);
  const muted = ensure(t.muted!, grounds);
  const accentStrong = ensure(t["accent-strong"]!, grounds);
  // The accent is text too (links, active icons) – on every ground except the selected row.
  let accent = ensure(t.accent!, [hover, surface, content, sidebar]);
  const accentContrast = t["accent-contrast"]!;
  if (contrast(accentContrast, accent) < 4.5) accent = ensure(accent, [accentContrast]);
  // The accent button's hover fill must still carry its label.
  const accentHover = contrast(accentContrast, accentStrong) >= 4.5 ? accentStrong : ensure(accentStrong, [accentContrast]);
  return {
    bg: hover,
    surface,
    content,
    sidebar,
    hover,
    border: t.border!,
    "border-subtle": t["border-subtle"]!,
    text,
    secondary,
    muted,
    accent,
    "accent-hover": accentHover,
    "accent-strong": accentStrong,
    "accent-soft": t["accent-soft"]!,
    "accent-contrast": accentContrast,
    focus: accent,
  };
}

/** Light and dark variables for a stored theme; null for the default (globals.css as it is). */
export function themeVars(theme: ThemeInput | null): { light: AppVars; dark: AppVars; corrected: (keyof ThemeColors)[] } | null {
  if (!theme || theme.preset === "emu") return null;
  const tokens = themeTokens(theme);
  const light = appVars(tokens.light, "light");
  // `rail` is not part of this app – never report it as corrected; a lifted content ground is.
  const corrected = tokens.corrected.filter((c) => c !== "rail");
  if (light.content !== tokens.light.bg && !corrected.includes("bg")) corrected.push("bg");
  return { light, dark: appVars(tokens.dark, "dark"), corrected };
}

const declarations = (vars: AppVars) =>
  Object.entries(vars)
    .map(([k, v]) => `--${k}:${v}`)
    .join(";");

/**
 * CSS for a stored value (untrusted until parsed: only presets or #rrggbb reach the output).
 * Empty for the default theme.
 */
export function themeCss(value: unknown): string {
  const vars = themeVars(parseTheme(value));
  if (!vars) return "";
  return (
    `:root{${declarations(vars.light)}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${declarations(vars.dark)}}}` +
    `:root[data-theme="dark"]{${declarations(vars.dark)}}`
  );
}

/** The theme in effect: the person's own colors win over the workspace default. */
export function effectiveTheme(personal: unknown, workspace: unknown): unknown {
  return parseTheme(personal) ? personal : workspace;
}
