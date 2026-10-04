import { createAttachment, PartError } from "@/db/queries/ticket-parts";
import { json, jsonError, requireApiMember } from "@/lib/api";
import { de } from "@/lib/i18n/de";
import { MAX_ATTACHMENT_BYTES } from "@/lib/limits";

type Ctx = { params: Promise<{ workspaceId: string; ticketId: string }> };

/** Upload one image (multipart field "file"). Type is decided by magic bytes, not the header. */
export async function POST(request: Request, { params }: Ctx) {
  const { workspaceId, ticketId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return jsonError(404, "not_found", "Nicht gefunden.");

  // Reject oversized bodies before reading them (multipart overhead allowed).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + 16 * 1024) return jsonError(413, "too_large", de.parts.errors.too_large);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "invalid_image", de.parts.errors.invalid_image);
  if (file.size > MAX_ATTACHMENT_BYTES) return jsonError(413, "too_large", de.parts.errors.too_large);

  try {
    const row = await createAttachment(
      { userId: r.ctx.user.id, workspaceId: r.ctx.workspace.id },
      ticketId,
      { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name },
    );
    return json(row);
  } catch (e) {
    if (e instanceof PartError) {
      const status = e.code === "not_found" ? 404 : e.code === "too_large" ? 413 : e.code === "invalid_image" ? 415 : 422;
      return jsonError(status, e.code, de.parts.errors[e.code]);
    }
    throw e;
  }
}
