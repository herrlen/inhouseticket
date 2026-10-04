import { describe, expect, it } from "vitest";
import { sniffImage } from "./image-sniff";

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

// Real 3×2 PNG.
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==");

// JPEG: SOI, APP0 (JFIF, length 16), SOF0 with height 480, width 640.
const JPEG = bytes(
  [0xff, 0xd8],
  [0xff, 0xe0, 0x00, 0x10], "JFIF", [0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00],
  [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
);

const riff = (chunk: string, payload: number[]) => bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, [0, 0, 0, 0], payload);
// VP8 (lossy): frame tag (3), start code 9d 01 2a, width 400, height 300.
const WEBP_LOSSY = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x90, 0x01, 0x2c, 0x01, 0, 0]);
// VP8L (lossless): signature 0x2f, 14-bit (w-1)=99, (h-1)=49.
const bitsL = 99 | (49 << 14);
const WEBP_LOSSLESS = riff("VP8L", [0x2f, bitsL & 0xff, (bitsL >> 8) & 0xff, (bitsL >> 16) & 0xff, (bitsL >> 24) & 0xff, 0, 0, 0, 0, 0]);
// VP8X (extended): flags + reserved (4), 24-bit (w-1)=1199, (h-1)=627.
const WEBP_EXTENDED = riff("VP8X", [0, 0, 0, 0, 0xaf, 0x04, 0x00, 0x73, 0x02, 0x00]);

describe("sniffImage", () => {
  it("reads PNG type and size", () => expect(sniffImage(PNG)).toEqual({ mime: "image/png", width: 3, height: 2 }));
  it("reads JPEG type and size from SOF", () => expect(sniffImage(JPEG)).toEqual({ mime: "image/jpeg", width: 640, height: 480 }));
  it("reads WebP lossy, lossless and extended", () => {
    expect(sniffImage(WEBP_LOSSY)).toEqual({ mime: "image/webp", width: 400, height: 300 });
    expect(sniffImage(WEBP_LOSSLESS)).toEqual({ mime: "image/webp", width: 100, height: 50 });
    expect(sniffImage(WEBP_EXTENDED)).toEqual({ mime: "image/webp", width: 1200, height: 628 });
  });

  it.each([
    ["GIF", bytes("GIF89a", [1, 0, 1, 0, 0, 0, 0])],
    ["SVG disguised as PNG name", bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["HTML", bytes("<!doctype html><script>alert(1)</script>")],
    ["PDF", bytes("%PDF-1.7\n")],
    ["truncated PNG", PNG.subarray(0, 12)],
    ["empty", new Uint8Array()],
  ])("rejects %s", (_, data) => {
    expect(sniffImage(data)).toBeNull();
  });

  it("rejects absurd dimensions (decompression bombs)", () => {
    const huge = new Uint8Array(PNG);
    new DataView(huge.buffer).setUint32(16, 100_000);
    expect(sniffImage(huge)).toBeNull();
  });
});
