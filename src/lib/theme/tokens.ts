// Copied from emuchat (packages/ui/src/theme/tokens.ts) – keep both identical until the shared core
// (emu-core, X1). Here only the source for the theme engine; this app's CSS lives in globals.css.
// App design tokens (Redesign X2, docs: emuchat_Redesign_Integrationen_Konzept.md). The source of
// truth for app-theme.css (a test keeps both in step) and later for the theme engine (X3).
// Names become Tailwind colors: --color-surface → bg-surface, text-surface …

export type TokenSet = Record<string, string>;

/** Default theme "Emu", light. */
export const LIGHT: TokenSet = {
  bg: "#ffffff",
  surface: "#f4f0ea",
  rail: "#2a1f18",
  "rail-fg": "#d8ccc2",
  border: "#ddd5cb",
  "border-subtle": "#eee9e2",
  hover: "#faf7f3",
  text: "#1f1a17",
  secondary: "#3d352f",
  muted: "#6b6159",
  accent: "#9a4a16",
  "accent-strong": "#7a3a10",
  "accent-soft": "#fbf3ea",
  "accent-contrast": "#ffffff",
  // Meaning colors: not themeable (X3), the same in every preset.
  "status-open-bg": "#eae4dc",
  "status-open-fg": "#3d352f",
  "status-progress": "#1d5fa8",
  "status-review": "#6b3fa0",
  "status-done": "#1f6b3a",
  "status-fg": "#ffffff",
  danger: "#b3261e",
  warning: "#b45309",
  info: "#1d5fa8",
  success: "#1f6b3a",
};

/** Default theme "Emu", dark: same names, every pairing still WCAG AA. */
export const DARK: TokenSet = {
  bg: "#171310",
  surface: "#1f1a16",
  rail: "#0e0b09",
  "rail-fg": "#cfc3b8",
  border: "#3b332d",
  "border-subtle": "#2a241f",
  hover: "#231d19",
  text: "#f3eee9",
  secondary: "#ddd4cc",
  muted: "#a99d93",
  accent: "#e7955a",
  "accent-strong": "#f2b282",
  "accent-soft": "#2c2018",
  "accent-contrast": "#1a0f08",
  "status-open-bg": "#3b332d",
  "status-open-fg": "#ece5de",
  "status-progress": "#1d5fa8",
  "status-review": "#6b3fa0",
  "status-done": "#1f6b3a",
  "status-fg": "#ffffff",
  danger: "#f2867e",
  warning: "#f0a35c",
  info: "#7fb2ec",
  success: "#6fcf97",
};

/** Text on background pairs that must reach 4.5:1 (WCAG AA) in every theme. */
export const CONTRAST_PAIRS: [fg: string, bg: string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["secondary", "bg"],
  ["secondary", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "hover"],
  ["rail-fg", "rail"],
  ["accent", "bg"],
  ["accent-strong", "bg"],
  ["accent-strong", "surface"],
  ["accent-strong", "accent-soft"],
  ["accent-contrast", "accent"],
  ["text", "accent-soft"],
  ["status-open-fg", "status-open-bg"],
  ["status-fg", "status-progress"],
  ["status-fg", "status-review"],
  ["status-fg", "status-done"],
  ["danger", "bg"],
  ["warning", "bg"],
  ["info", "bg"],
  ["success", "bg"],
];

function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of #rrggbb. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The variables of a token set as CSS declarations (also used by app-theme.css's test). */
export function cssVariables(tokens: TokenSet): string {
  return Object.entries(tokens)
    .map(([name, value]) => `--color-${name}: ${value};`)
    .join("\n");
}
