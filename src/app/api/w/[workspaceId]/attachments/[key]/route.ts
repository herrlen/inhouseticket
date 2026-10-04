import { getAttachmentFile } from "@/db/queries/ticket-parts";
import { jsonError, requireApiMember } from "@/lib/api";

type Ctx = { params: Promise<{ workspaceId: string; key: string }> };

/** Serves an image to members only. Content never changes for a key → long private cache. */
export async function GET(_: Request, { params }: Ctx) {
  const { workspaceId, key } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(key)) return jsonError(404, "not_found", "Nicht gefunden.");
  const file = await getAttachmentFile(r.ctx.workspace.id, key);
  if (!file) return jsonError(404, "not_found", "Nicht gefunden.");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
