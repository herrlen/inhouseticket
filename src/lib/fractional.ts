import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// Sort keys for manual ordering. Compare byte-wise (Postgres columns use COLLATE "C",
// JS uses compareKeys) – never with localeCompare.

/** Key that sorts between `before` and `after` (either may be null = open end). */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function keysBetween(before: string | null, after: string | null, n: number): string[] {
  return generateNKeysBetween(before, after, n);
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * New key for moving an item to `index` within `siblings` (sorted keys, the moved item
 * already removed).
 */
export function keyForIndex(siblings: readonly string[], index: number): string {
  const before = index > 0 ? (siblings[index - 1] ?? null) : null;
  const after = siblings[index] ?? null;
  return keyBetween(before, after);
}
