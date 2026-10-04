import type { AllowedMime } from "@/lib/limits";

// Detects WebP/JPEG/PNG from the file's magic bytes and reads the pixel size from its header.
// Never trusts the declared MIME type or file extension (CLAUDE.md rule 2).

export type SniffedImage = { mime: AllowedMime; width: number; height: number };

const MAX_DIMENSION = 20_000;

function ascii(b: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...b.subarray(start, start + length));
}

function png(b: Uint8Array): SniffedImage | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { mime: "image/png", width: v.getUint32(16), height: v.getUint32(20) };
}

function jpeg(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue; // fill byte
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without length
      continue;
    }
    const length = v.getUint16(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { mime: "image/jpeg", height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): SniffedImage | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Key frame start code 9d 01 2a, then 14-bit width/height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: "image/webp", width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return {
      mime: "image/webp",
      width: (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1,
      height: (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1,
    };
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const result = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!result) return null;
  const ok = (n: number) => Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION;
  return ok(result.width) && ok(result.height) ? result : null;
}
