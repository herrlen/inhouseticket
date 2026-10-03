// Project palette – KONZEPT §5.2. Hex values must match --p-* in src/app/globals.css
// (checked in src/app/tokens.test.ts). Projects store the hex value in `project.color`.

export const PALETTE = {
  coral: "#FF6B5B",
  orange: "#FF9F1C",
  sun: "#F5C400",
  lime: "#8AC926",
  mint: "#2EC4B6",
  turquoise: "#00B4D8",
  blue: "#3A86FF",
  indigo: "#5B5BF7",
  violet: "#9B5DE5",
  pink: "#F15BB5",
  berry: "#C9184A",
  slate: "#64748B",
} as const;

export type PaletteColor = keyof typeof PALETTE;
export const PALETTE_COLORS = Object.keys(PALETTE) as PaletteColor[];

export function paletteColorFromHex(hex: string): PaletteColor | undefined {
  const upper = hex.toUpperCase();
  return PALETTE_COLORS.find((c) => PALETTE[c] === upper);
}

/** Stable palette color for a string (e.g. a user id), used for avatars. */
export function paletteColorFor(seed: string): PaletteColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE_COLORS[Math.abs(hash) % PALETTE_COLORS.length]!;
}
