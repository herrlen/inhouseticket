import { deflateSync } from "node:zlib";

// PNG fixtures built in the test (no binary files in the repo).

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGB PNG; `noise` makes it incompressible (→ large file that must be shrunk). */
export function png(width: number, height: number, noise = false): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  let seed = 42;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 3;
      if (noise) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed & 255;
        raw[i + 1] = (seed >> 8) & 255;
        raw[i + 2] = (seed >> 16) & 255;
      } else {
        raw[i] = (x * 255) / width;
        raw[i + 1] = (y * 255) / height;
        raw[i + 2] = 180;
      }
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
}
