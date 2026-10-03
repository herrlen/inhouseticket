// Initial sort keys for freshly created rows ("a0", "a1", …). They are valid keys for
// fractional indexing, which Sprint 4 introduces for drag & drop.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function initialSortKey(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= DIGITS.length) {
    throw new RangeError(`initialSortKey supports 0–${DIGITS.length - 1}, got ${index}`);
  }
  return `a${DIGITS[index]}`;
}
