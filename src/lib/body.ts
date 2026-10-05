import "server-only";

/**
 * Reads a request body up to `maxBytes` and aborts beyond that – also for chunked uploads
 * without Content-Length, so an oversized body never ends up in memory.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | "too_large"> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return "too_large";
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
