import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readBodyLimited } = await import("./body");

function chunked(parts: number[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of parts) c.enqueue(new Uint8Array(n));
      c.close();
    },
  });
  return new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

describe("readBodyLimited", () => {
  it("returns the body when it fits", async () => {
    const body = await readBodyLimited(chunked([10, 20]), 30);
    expect(body).toBeInstanceOf(Uint8Array);
    expect((body as Uint8Array).byteLength).toBe(30);
  });

  it("aborts a chunked body without Content-Length once it exceeds the limit", async () => {
    expect(await readBodyLimited(chunked([20, 20, 20]), 30)).toBe("too_large");
  });

  it("rejects a declared length above the limit before reading", async () => {
    const req = new Request("http://x/", { method: "POST", body: "x".repeat(10), headers: { "content-length": "999" } });
    expect(await readBodyLimited(req, 30)).toBe("too_large");
  });
});
