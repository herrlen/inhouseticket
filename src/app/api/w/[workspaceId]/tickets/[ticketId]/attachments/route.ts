import { createAttachment, PartError } from "@/db/queries/ticket-parts";
import { json, jsonError, requireApiMember, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { readBodyLimited } from "@/lib/body";
import { rateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n/server";
import { MAX_ATTACHMENT_BYTES } from "@/lib/limits";

const UPLOADS_PER_MINUTE = 30;

type Ctx = { params: Promise<{ workspaceId: string; ticketId: string }> };

/** Upload one image (multipart field "file"). Type is decided by magic bytes, not the header. */
export async function POST(request: Request, { params }: Ctx) {
  const t = await getT();
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId, ticketId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return jsonError(404, "not_found", "Nicht gefunden.");

  const limited = tooManyRequests(rateLimit(`upload:${r.ctx.user.id}`, UPLOADS_PER_MINUTE, 60_000));
  if (limited) return limited;

  // Never buffer more than one image plus multipart overhead – also without Content-Length.
  const body = await readBodyLimited(request, MAX_ATTACHMENT_BYTES + 16 * 1024);
  if (body === "too_large") return jsonError(413, "too_large", t.parts.errors.too_large);
  const contentType = request.headers.get("content-type") ?? "";
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "invalid_image", t.parts.errors.invalid_image);
  if (file.size > MAX_ATTACHMENT_BYTES) return jsonError(413, "too_large", t.parts.errors.too_large);

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
      return jsonError(status, e.code, t.parts.errors[e.code]);
    }
    throw e;
  }
}
